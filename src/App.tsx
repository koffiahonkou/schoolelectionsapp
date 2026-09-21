/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  AuditLogEntry,
  Ballot,
  Candidate,
  ElectionConfig,
  ElectionData,
  ElectionStatus,
  Position,
  UserAccount,
  Voter,
  getUserPermissions,
} from './types';
import {
  getDefaultElectionData,
  createEmptyElectionData,
  loadElectionData,
  saveElectionData,
  normalizeElectionData,
  downloadJSON,
  saveStoredElectionStatus,
  loadStoredElectionStatus,
} from './utils/storage';
import { createChainedAuditEntry } from './utils/cryptoAudit';
import { sounds } from './utils/audio';
import { Header } from './components/Header';
import { PracticeBanner } from './components/Common/PracticeBanner';
import { VoterLogin } from './components/VoterBooth/VoterLogin';
import { BallotView, clearBallotAutosave } from './components/VoterBooth/BallotView';
import { ReviewBallotModal } from './components/VoterBooth/ReviewBallotModal';
import { VoteConfirmation } from './components/VoterBooth/VoteConfirmation';
import { BoothBackground } from './components/VoterBooth/BoothBackground';
import { PageBackground } from './components/Common/PageBackground';
import { AdminAuthModal } from './components/Admin/AdminAuthModal';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { AgentMonitoringView } from './components/Agents/AgentMonitoringView';
import { ResultsDashboard } from './components/Results/ResultsDashboard';
import { PrintableReport } from './components/Results/PrintableReport';
import { VoterResultsLoginModal } from './components/VoterBooth/VoterResultsLoginModal';
import {
  saveAnonymousVoteToFirestore,
  markVoterTokenUsedInFirestore,
  syncVoterRosterToFirestoreTokens,
  clearAllFirestoreElectionData,
  saveElectionStatusToFirestore,
  saveElectionStateToFirestore,
  getElectionMetadataFromFirestore,
  subscribeToElectionMetadata,
  subscribeToAnonymousVotes,
  subscribeToVoterTokens,
} from './lib/firebaseVoting';

const ACTIVE_VOTER_SESSION_KEY = 'school_election_active_voter_session';

export default function App() {
  const [data, setData] = useState<ElectionData | null>(null);
  const [status, setStatus] = useState<ElectionStatus>(() => {
    const saved = loadStoredElectionStatus();
    return saved || 'Open';
  });
  const [isStatusChecked, setIsStatusChecked] = useState(false);
  const [currentView, setCurrentView] = useState<'booth' | 'admin' | 'results' | 'agents'>('booth');
  const [isPractice, setIsPractice] = useState(false);

  // Admin authentication state & current logged in user
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  // Voter session state
  const [activeVoter, setActiveVoter] = useState<Voter | null>(null);
  const [pendingChoices, setPendingChoices] = useState<Record<string, string>>({});
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [isVoteConfirmed, setIsVoteConfirmed] = useState(false);
  const [confirmedVoterName, setConfirmedVoterName] = useState('');
  const [sessionTimeoutNotice, setSessionTimeoutNotice] = useState<string | null>(null);

  // Authenticated Voter Results Viewing state
  const [voterResultsViewer, setVoterResultsViewer] = useState<Voter | null>(null);
  const [isVoterResultsModalOpen, setIsVoterResultsModalOpen] = useState(false);

  // Dark Mode state with persistence & system preference fallback
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('school_elections_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('school_elections_theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [isDarkMode]);

  const handleToggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
    sounds.playSelect();
  }, []);

  // Strict Access Control: Unauthenticated visitors are restricted to the booth,
  // UNLESS an authenticated voter is reviewing official results when published,
  // OR an observer/aspirant polling agent is viewing the live agent monitoring station.
  useEffect(() => {
    if (!isAdminAuthenticated) {
      const isAllowedResults = voterResultsViewer && status === 'Results Published' && currentView === 'results';
      const isAllowedAgents = currentView === 'agents';
      if (currentView !== 'booth' && !isAllowedResults && !isAllowedAgents) {
        setCurrentView('booth');
      }
    }
  }, [isAdminAuthenticated, voterResultsViewer, status, currentView]);

  // If election status ceases to be 'Results Published', clear student results viewer
  useEffect(() => {
    if (status !== 'Results Published' && voterResultsViewer) {
      setVoterResultsViewer(null);
      if (currentView === 'results' && !isAdminAuthenticated) {
        setCurrentView('booth');
      }
    }
  }, [status, voterResultsViewer, currentView, isAdminAuthenticated]);

  // 1. Initial Data Loading & Real-Time Syncing (Online Concurrent Voting across Netlify & devices)
  useEffect(() => {
    let isMounted = true;

    // Load from online server & Firestore first, fallback to IndexedDB
    const initializeData = async () => {
      let resolvedData = false;

      // Safety timeout: Ensure the app renders within 5.5 seconds even if storage or networks are slow
      const safetyTimeout = setTimeout(() => {
        if (isMounted) {
          if (!resolvedData) {
            console.warn('Initial storage load timed out, rendering with cached/default election data');
            setData((prev) => prev || getDefaultElectionData());
          }
          setIsStatusChecked(true);
        }
      }, 5500);

      // 1. PRIORITIZE WAITING FOR FIREBASE 'ElectionStatus' CHECK
      // Strictly eliminates transient 'closed' or 'setup' state flashes during page refresh
      let cloudStatusVerified = false;
      try {
        const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 5000));
        const cloudMeta = await Promise.race([getElectionMetadataFromFirestore(), timeoutPromise]);

        if (cloudMeta && isMounted) {
          if (cloudMeta.status) {
            setStatus(cloudMeta.status);
            saveStoredElectionStatus(cloudMeta.status);
            cloudStatusVerified = true;
          }
          if (Array.isArray(cloudMeta.positions) || cloudMeta.config) {
            const fallback = getDefaultElectionData();
            let baseAccounts = (Array.isArray(cloudMeta.accounts) && cloudMeta.accounts.length > 0)
              ? [...cloudMeta.accounts]
              : [...fallback.accounts];
            for (const defAcc of fallback.accounts) {
              if (!baseAccounts.some((a) => a.id === defAcc.id || a.role === defAcc.role)) {
                baseAccounts.push(defAcc);
              }
            }
            const cloudData: ElectionData = {
              config: cloudMeta.config ? { ...fallback.config, ...cloudMeta.config } : fallback.config,
              positions: Array.isArray(cloudMeta.positions) ? cloudMeta.positions : [],
              candidates: Array.isArray(cloudMeta.candidates) ? cloudMeta.candidates : [],
              voters: Array.isArray(cloudMeta.voters) ? cloudMeta.voters : [],
              ballots: [],
              auditLogs: fallback.auditLogs,
              accounts: baseAccounts,
            };
            setData(cloudData);
            saveElectionData(cloudData).catch(() => {});
            resolvedData = true;
          }
        }
      } catch (cloudErr) {
        console.warn('[Firebase] Could not fetch initial cloud election metadata:', cloudErr);
      } finally {
        if (isMounted) {
          setIsStatusChecked(true);
        }
      }

      // 2. Fetch from online Express server (if running in full-stack Node container)
      if (!resolvedData && isMounted) {
        try {
          const response = await fetch('/api/election');
          const contentType = response.headers.get('content-type');
          if (response.ok && contentType && contentType.includes('application/json')) {
            const json = await response.json();
            if (json.success && json.data && isMounted) {
              resolvedData = true;
              setData(json.data);
              if (!cloudStatusVerified && json.status) {
                setStatus(json.status);
                saveStoredElectionStatus(json.status);
              }
              saveElectionData(json.data).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('Could not load from /api/election server, falling back to local DB:', err);
        }
      }

      // 3. Fallback to IndexedDB / localStorage
      if (!resolvedData && isMounted) {
        try {
          const loaded = await loadElectionData();
          if (isMounted) {
            resolvedData = true;
            setData(loaded);
            if (!cloudStatusVerified) {
              const savedStatus = loadStoredElectionStatus();
              if (savedStatus) {
                setStatus(savedStatus);
              } else if (loaded.ballots.length > 0) {
                setStatus('Open');
              } else {
                setStatus('Open');
              }
            }
          }
        } catch (fallbackErr) {
          console.error('Failed to load local election data:', fallbackErr);
          if (isMounted) {
            resolvedData = true;
            const fallback = getDefaultElectionData();
            setData(fallback);
            if (!cloudStatusVerified) {
              const savedStatus = loadStoredElectionStatus();
              setStatus(savedStatus || 'Open');
            }
          }
        }
      }

      clearTimeout(safetyTimeout);
    };

    initializeData();

    // Real-time Firestore metadata listener:
    // When Commissioner on Device 1 opens voting or updates positions/candidates/roster,
    // all devices on Netlify / mobile instantly receive the update without page refresh!
    const unsubscribeMeta = subscribeToElectionMetadata((meta) => {
      if (!isMounted) return;
      if (meta.status) {
        setStatus(meta.status);
        saveStoredElectionStatus(meta.status);
        setIsStatusChecked(true);
      }
      if (Array.isArray(meta.positions) && Array.isArray(meta.candidates)) {
        setData((prev) => {
          if (!prev) return prev;
          const updated: ElectionData = {
            ...prev,
            config: meta.config ? { ...prev.config, ...meta.config } : prev.config,
            positions: meta.positions,
            candidates: meta.candidates,
            voters: Array.isArray(meta.voters) ? meta.voters : prev.voters,
            accounts: (Array.isArray(meta.accounts) && meta.accounts.length > 0) ? meta.accounts : prev.accounts,
          };
          saveElectionData(updated).catch(() => {});
          return updated;
        });
      }
    });

    // Real-time Firestore anonymous votes listener:
    // Synchronizes anonymous ballots cast from any device in real-time.
    const unsubscribeVotes = subscribeToAnonymousVotes((liveBallots) => {
      if (!isMounted) return;
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ballots: liveBallots,
        };
      });
    });

    // Real-time Firestore voter tokens listener:
    // Synchronizes the hasVoted status for students across all devices.
    const unsubscribeTokens = subscribeToVoterTokens((tokens) => {
      if (!isMounted) return;
      setData((prev) => {
        if (!prev) return prev;
        const votedMap = new Map<string, string | null>();
        tokens.forEach((t) => {
          if (t.hasVoted || t.status === 'used') {
            votedMap.set(t.voterId.toUpperCase(), t.votedAt || new Date().toISOString());
          }
        });
        if (votedMap.size === 0) return prev;
        let changed = false;
        const updatedVoters = prev.voters.map((v) => {
          const votedAt = votedMap.get(v.voterId.toUpperCase());
          if (votedAt && !v.hasVoted) {
            changed = true;
            return { ...v, hasVoted: true, votedAt };
          }
          return v;
        });
        if (!changed) return prev;
        return { ...prev, voters: updatedVoters };
      });
    });

    // Periodic live sync every 3s for server endpoints (if online Express backend active)
    const syncInterval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/election');
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const json = await res.json();
          if (json.success && json.data && isMounted) {
            setData((prev) => {
              if (!prev) return json.data;
              return {
                ...json.data,
                config: json.data.config || prev.config,
              };
            });
            if (json.status) {
              setStatus(json.status);
              saveStoredElectionStatus(json.status);
            }
          }
        }
      } catch {
        // silent catch on network hiccups
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
      unsubscribeMeta();
      unsubscribeVotes();
      unsubscribeTokens();
    };
  }, []);

  // Restore active voter session on page reload if within valid timeframe (30 mins) and not already voted
  useEffect(() => {
    if (activeVoter || !data) return;
    try {
      const raw = sessionStorage.getItem(ACTIVE_VOTER_SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      if (session?.voter?.voterId) {
        const THIRTY_MINUTES = 30 * 60 * 1000;
        if (Date.now() - (session.loginTime || 0) < THIRTY_MINUTES) {
          const found = data.voters.find(
            (v) => v.voterId.toUpperCase() === session.voter.voterId.toUpperCase()
          );
          if (found && (!found.hasVoted || session.isPractice)) {
            setActiveVoter(found);
            if (session.isPractice !== undefined) {
              setIsPractice(session.isPractice);
            }
            return;
          }
        }
      }
      sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY);
    } catch {
      // ignore
    }
  }, [data, activeVoter]);

  // Helper to persist state with audit log, local storage, online server sync, and Firestore cloud sync
  const persistElectionData = useCallback((updater: (prev: ElectionData) => ElectionData) => {
    setData((prev) => {
      if (!prev) return prev;
      const updated = updater(prev);
      saveElectionData(updated).catch((err) =>
        console.error('Error saving election data locally:', err)
      );

      // 1. Sync canonical state to Firestore so all devices on Netlify & mobile receive updates immediately
      saveElectionStateToFirestore(
        updated,
        status,
        currentUser ? currentUser.fullName || currentUser.username : 'Admin'
      ).catch((err) => console.warn('[Firebase] Firestore election state sync warning:', err));

      // 2. Sync state update to server so all concurrent clients on Node dev/server receive updates
      fetch('/api/election/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updated }),
      }).catch((err) => console.warn('Server sync error on election update:', err));

      return updated;
    });
  }, [currentUser, status]);

  // Log an audit event with SHA-256 cryptographic chain
  const logAuditEvent = useCallback(
    (
      eventType: AuditLogEntry['eventType'],
      details: string,
      category: AuditLogEntry['category'],
      extra?: {
        actor?: string;
        actorRole?: string;
        metadata?: Record<string, any>;
      }
    ) => {
      const defaultActor = currentUser ? currentUser.fullName || currentUser.username : (activeVoter ? `${activeVoter.fullName} (${activeVoter.voterId})` : 'System');
      const defaultRole = currentUser ? currentUser.role : (activeVoter ? 'Voter' : 'System');

      const payload = {
        eventType,
        details,
        category,
        actor: extra?.actor || defaultActor,
        actorRole: extra?.actorRole || defaultRole,
        metadata: extra?.metadata,
      };

      // 1. Send to server to calculate canonical SHA-256 hash and persist to disk
      fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((resData) => {
          if (resData.success && resData.entry) {
            setData((prev) => {
              if (!prev) return prev;
              if (prev.auditLogs.some((l) => l.id === resData.entry.id)) return prev;
              const updated = {
                ...prev,
                auditLogs: [...prev.auditLogs, resData.entry],
              };
              saveElectionData(updated).catch(() => {});
              return updated;
            });
          }
        })
        .catch(() => {
          // Local cryptographic chain fallback
          setData((prev) => {
            if (!prev) return prev;
            const entry = createChainedAuditEntry(prev.auditLogs, payload);
            const updated = {
              ...prev,
              auditLogs: [...prev.auditLogs, entry],
            };
            saveElectionData(updated).catch(() => {});
            return updated;
          });
        });
    },
    [currentUser, activeVoter]
  );

  // 2. Election Status Transitions
  const handleUpdateStatus = (newStatus: ElectionStatus) => {
    setStatus(newStatus);
    saveStoredElectionStatus(newStatus);

    // Persist status to Firestore so every device, browser, and Netlify instance updates instantly
    saveElectionStatusToFirestore(
      newStatus,
      currentUser ? currentUser.fullName || currentUser.username : 'Electoral Commission Admin'
    ).catch((err) => console.warn('[Firebase] Failed to persist election status to Firestore:', err));

    // Also sync to Express backend (if available)
    fetch('/api/election/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {});

    let eventType: AuditLogEntry['eventType'] = 'voting_opened';
    let details = `Election status shifted to ${newStatus}.`;

    if (newStatus === 'Open') {
      eventType = 'voting_opened';
      details = 'Voting stations opened by Electoral Commission.';
    } else if (newStatus === 'Closed') {
      eventType = 'voting_closed';
      details = 'Voting stations closed. Ballots locked.';
    } else if (newStatus === 'Results Published') {
      eventType = 'results_published';
      details = 'Official certified results published for public viewing.';
    } else if (newStatus === 'Setup') {
      eventType = 'setup_unlocked';
      details = 'Ballot setup mode unlocked by Administrator.';
    }

    logAuditEvent(eventType, details, 'election', {
      actor: currentUser ? currentUser.fullName || currentUser.username : 'Electoral Commission Admin',
      actorRole: currentUser?.role || 'Admin',
    });
  };

  // 3. Voter Booth Handlers
  const handleVoterLoginSuccess = (voter: Voter) => {
    setSessionTimeoutNotice(null);
    setActiveVoter(voter);
    setPendingChoices({});
    setIsVoteConfirmed(false);
    try {
      sessionStorage.setItem(
        ACTIVE_VOTER_SESSION_KEY,
        JSON.stringify({
          voter,
          isPractice,
          loginTime: Date.now(),
        })
      );
    } catch {
      // ignore
    }

    logAuditEvent(
      'voter_login',
      isPractice
        ? `Demo practice voting session started for ${voter.fullName} (${voter.voterId}).`
        : `Student voter authenticated at booth: ${voter.fullName} (ID: ${voter.voterId}). Identity verified.`,
      'ballot',
      {
        actor: `${voter.fullName} (${voter.voterId})`,
        actorRole: 'Voter',
        metadata: { studentId: voter.voterId, isPractice },
      }
    );
  };

  const handleReviewBallot = (choices: Record<string, string>) => {
    setPendingChoices(choices);
    setIsReviewModalOpen(true);
  };

  const handleCancelVoterSession = () => {
    if (activeVoter) {
      clearBallotAutosave(activeVoter.voterId);
      logAuditEvent(
        'voter_session_cancelled',
        `Voting booth session cancelled by voter ${activeVoter.fullName} (${activeVoter.voterId}) before depositing ballot.`,
        'ballot',
        {
          actor: `${activeVoter.fullName} (${activeVoter.voterId})`,
          actorRole: 'Voter',
          metadata: { studentId: activeVoter.voterId },
        }
      );
    }
    try {
      sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY);
    } catch {
      // ignore
    }
    setActiveVoter(null);
    setPendingChoices({});
    setIsReviewModalOpen(false);
    setIsVoteConfirmed(false);
  };

  const handleVoterSessionTimeout = () => {
    if (activeVoter) {
      const studentName = activeVoter.fullName;
      const studentId = activeVoter.voterId;
      clearBallotAutosave(studentId);
      try {
        sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY);
      } catch {
        // ignore
      }
      setActiveVoter(null);
      setPendingChoices({});
      setIsReviewModalOpen(false);
      setIsVoteConfirmed(false);
      setSessionTimeoutNotice(
        `Voting session automatically timed out after 3 minutes of inactivity to protect your ballot secrecy. Please log in again to cast your ballot.`
      );
      logAuditEvent(
        'voter_session_timeout',
        `Voting booth session automatically closed due to 3-minute idle timeout on ballot for student ${studentName} (${studentId}).`,
        'security',
        {
          actor: `${studentName} (${studentId})`,
          actorRole: 'Voter',
          metadata: { studentId },
        }
      );
      sounds.playError();
    }
  };

  // Critical Secret Ballot Submission (Concurrent Online Voting Supported)
  const handleConfirmSubmitVote = async () => {
    if (!data || !activeVoter) return;

    // Client-side quick check
    if (!isPractice) {
      const currentVoterRecord = data.voters.find(
        (v) => v.voterId.toUpperCase() === activeVoter.voterId.toUpperCase()
      );
      if (currentVoterRecord?.hasVoted) {
        alert('This student ID has already cast a vote in this election.');
        handleCancelVoterSession();
        return;
      }
    }

    setIsSubmittingVote(true);
    const voterName = activeVoter.fullName;
    const voterId = activeVoter.voterId;
    const pin = activeVoter.pin;

    // Submit to server online vote endpoint (if running with Express backend)
    try {
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterId,
          passcode: pin,
          choices: pendingChoices,
          isPractice,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const resData = await response.json();

        if (!resData.success) {
          const errorMsg = resData.error || 'Failed to submit ballot online.';
          alert(errorMsg);
          setIsSubmittingVote(false);
          if (response.status === 409) {
            handleCancelVoterSession();
          }
          return;
        }

        // Live state successfully updated on online server
        if (resData.data) {
          setData(resData.data);
          saveElectionData(resData.data).catch(() => {});
          // Synchronize anonymous vote to Firestore and update voter token
          const castBallot = resData.data.ballots[resData.data.ballots.length - 1];
          if (castBallot) {
            saveAnonymousVoteToFirestore(castBallot).catch((err) =>
              console.warn('[Firebase] Firestore vote sync warning:', err)
            );
          }
          if (!isPractice && voterId) {
            markVoterTokenUsedInFirestore(voterId).catch((err) =>
              console.warn('[Firebase] Firestore token sync warning:', err)
            );
          }
        }

        clearBallotAutosave(voterId);
        try {
          sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY);
        } catch {
          // ignore
        }

        sounds.playSuccess();
        setIsSubmittingVote(false);
        setIsReviewModalOpen(false);
        setConfirmedVoterName(voterName);
        setIsVoteConfirmed(true);
        setActiveVoter(null);
        return;
      }
    } catch (networkErr) {
      console.warn('Online server endpoint unreachable or static host (Netlify), processing via Firestore direct submission:', networkErr);
    }

    // Local Fallback (if server unreachable or strictly offline)
    const newBallot: Ballot = {
      id: 'bal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      submittedAt: new Date().toISOString(),
      isPractice,
      choices: { ...pendingChoices },
    };

    // Synchronize anonymous vote to Firestore and update voter token
    saveAnonymousVoteToFirestore(newBallot).catch((err) =>
      console.warn('[Firebase] Firestore vote fallback sync warning:', err)
    );
    if (!isPractice && voterId) {
      markVoterTokenUsedInFirestore(voterId).catch((err) =>
        console.warn('[Firebase] Firestore token sync warning:', err)
      );
    }

    persistElectionData((prev) => {
      const updatedVoters = isPractice
        ? prev.voters
        : prev.voters.map((v) =>
            v.voterId.toUpperCase() === activeVoter.voterId.toUpperCase()
              ? { ...v, hasVoted: true, votedAt: new Date().toISOString() }
              : v
          );

      const updatedBallots = [...prev.ballots, newBallot];

      const auditEntry = createChainedAuditEntry(prev.auditLogs, {
        eventType: 'ballot_submitted',
        details: isPractice
          ? 'Demo practice ballot cast.'
          : `Official anonymous ballot deposited. Total ballots: ${
              updatedBallots.filter((b) => !b.isPractice).length
            }/${prev.voters.length}.`,
        category: 'ballot',
        actor: 'Confidential Ballot Box',
        actorRole: 'Voter',
        metadata: {
          isPractice,
          ballotId: newBallot.id,
          totalCast: updatedBallots.filter((b) => !b.isPractice).length,
          totalEligible: prev.voters.length,
        },
      });

      return {
        ...prev,
        voters: updatedVoters,
        ballots: updatedBallots,
        auditLogs: [...prev.auditLogs, auditEntry],
      };
    });

    clearBallotAutosave(voterId);
    try {
      sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY);
    } catch {
      // ignore
    }

    sounds.playSuccess();
    setIsSubmittingVote(false);
    setIsReviewModalOpen(false);
    setConfirmedVoterName(voterName);
    setIsVoteConfirmed(true);
    setActiveVoter(null);
  };

  const handleFinishVoteConfirmation = useCallback(() => {
    try {
      sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY);
    } catch {
      // ignore
    }
    setIsVoteConfirmed(false);
    setActiveVoter(null);
    setPendingChoices({});
  }, []);

  // 4. Admin Management Handlers
  const [adminActiveTab, setAdminActiveTab] = useState<
    | 'turnout'
    | 'agentCharts'
    | 'accounts'
    | 'positions'
    | 'candidates'
    | 'roster'
    | 'settings'
    | 'audit'
  >('turnout');

  const handleRequestAdminView = (
    targetTab:
      | 'turnout'
      | 'agentCharts'
      | 'accounts'
      | 'positions'
      | 'candidates'
      | 'roster'
      | 'settings'
      | 'audit' = 'turnout'
  ) => {
    const isDeveloper = currentUser?.role === 'Developer';
    const isRestrictedTab = targetTab === 'accounts' || targetTab === 'settings';
    const safeTab = isRestrictedTab && !isDeveloper ? 'turnout' : targetTab;
    setAdminActiveTab(safeTab);
    if (isAdminAuthenticated) {
      if (currentUser?.role === 'Agent Monitor') {
        setCurrentView('agents');
      } else {
        setCurrentView('admin');
      }
    } else {
      setIsAdminAuthModalOpen(true);
    }
  };

  const handleRequestAuditTrailView = () => {
    handleRequestAdminView('audit');
  };

  const handleAdminAuthSuccess = (authenticatedAccount?: UserAccount) => {
    setIsAdminAuthenticated(true);
    const userToSet = authenticatedAccount || (!currentUser && data?.accounts && data.accounts.length > 0 ? data.accounts[0] : null);
    if (userToSet) {
      setCurrentUser(userToSet);
    }
    setIsAdminAuthModalOpen(false);

    // Agent Monitor role is exclusively dedicated to the Agent Monitoring station
    if (userToSet?.role === 'Agent Monitor') {
      setCurrentView('agents');
      return;
    }

    if (userToSet?.role !== 'Developer' && (adminActiveTab === 'accounts' || adminActiveTab === 'settings')) {
      setAdminActiveTab('turnout');
    }
    setCurrentView('admin');
  };

  const handleLogoutAdmin = () => {
    const actorName = currentUser ? currentUser.fullName || currentUser.username : 'Staff Member';
    const actorRole = currentUser?.role || 'Staff';
    logAuditEvent(
      'admin_logout',
      `Staff session ended for ${actorName} (${actorRole}). Terminal locked and returned to Voter Booth.`,
      'security',
      { actor: actorName, actorRole }
    );
    setIsAdminAuthenticated(false);
    setCurrentUser(null);
    setCurrentView('booth');
    sounds.playSelect();
  };

  const handleUpdateConfig = (updatedConfig: ElectionConfig) => {
    persistElectionData((prev) => ({
      ...prev,
      config: updatedConfig,
    }));
    logAuditEvent('settings_updated', 'Election configuration, dates and closing parameters updated.', 'security');
  };

  const handleUpdatePositions = (positions: Position[]) => {
    if (currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to update positions by non-developer.');
      return;
    }
    persistElectionData((prev) => ({
      ...prev,
      positions,
    }));
    logAuditEvent('positions_updated', `Ballot positions updated (${positions.length} active).`, 'election');
  };

  const handleDeletePosition = (positionId: string) => {
    if (currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to delete position by non-developer.');
      return;
    }
    persistElectionData((prev) => ({
      ...prev,
      positions: prev.positions.filter((p) => p.id !== positionId),
      candidates: prev.candidates.filter((c) => c.positionId !== positionId),
    }));
    logAuditEvent('positions_updated', `Ballot position and associated candidates deleted.`, 'election');
  };

  const handleAddCandidate = (cand: Candidate) => {
    if (currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to add candidate by non-developer.');
      return;
    }
    persistElectionData((prev) => ({
      ...prev,
      candidates: [...prev.candidates, cand],
    }));
    logAuditEvent('candidates_updated', `Registered candidate ${cand.name}.`, 'election');
  };

  const handleUpdateCandidate = (cand: Candidate) => {
    if (currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to update candidate by non-developer.');
      return;
    }
    persistElectionData((prev) => ({
      ...prev,
      candidates: prev.candidates.map((c) => (c.id === cand.id ? cand : c)),
    }));
    logAuditEvent('candidates_updated', `Updated profile for candidate ${cand.name}.`, 'election');
  };

  const handleDeleteCandidate = (candId: string) => {
    if (currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to delete candidate by non-developer.');
      return;
    }
    persistElectionData((prev) => ({
      ...prev,
      candidates: prev.candidates.filter((c) => c.id !== candId),
    }));
    logAuditEvent('candidates_updated', `Candidate removed from ballot.`, 'election');
  };

  const handleUpdateVoters = (voters: Voter[], logMessage: string) => {
    persistElectionData((prev) => ({
      ...prev,
      voters,
    }));
    logAuditEvent('roster_imported', logMessage, 'roster');
  };

  const handleResetVoterStatus = (voterId: string) => {
    persistElectionData((prev) => ({
      ...prev,
      voters: prev.voters.map((v) =>
        v.id === voterId ? { ...v, hasVoted: false, votedAt: null } : v
      ),
    }));
    logAuditEvent('roster_modified', `Reset hasVoted status for student in roster.`, 'roster');
  };

  const handleStartNewElection = async (clearRoster: boolean, isFullSystemWipe = false) => {
    if (isFullSystemWipe || clearRoster) {
      try {
        await clearAllFirestoreElectionData();
      } catch (err) {
        console.error('Failed to clear firestore data:', err);
      }
    }
    const empty = createEmptyElectionData(
      isFullSystemWipe ? 'New Student Election' : (data?.config.title || 'New Student Election'),
      isFullSystemWipe ? (data?.config.schoolName || 'Our School') : (data?.config.schoolName || 'Our School')
    );
    if (!clearRoster && !isFullSystemWipe && data?.voters) {
      // Keep roster but reset voted flags
      empty.voters = data.voters.map((v) => ({ ...v, hasVoted: false, votedAt: null }));
    }
    if (isFullSystemWipe || clearRoster) {
      empty.voters = [];
    }
    if (isFullSystemWipe) {
      empty.positions = [];
      empty.candidates = [];
      empty.ballots = [];
    }
    // Retain registered staff accounts across resets
    if (data?.accounts) {
      empty.accounts = data.accounts;
    }
    setData(empty);
    setStatus('Setup');
    saveStoredElectionStatus('Setup');
    await saveElectionStatusToFirestore('Setup', currentUser?.fullName || 'Admin').catch(() => {});
    await saveElectionStateToFirestore(empty, 'Setup', currentUser?.fullName || 'Admin').catch(() => {});
    await saveElectionData(empty);
    sounds.playSelect();
    logAuditEvent(
      'settings_updated',
      isFullSystemWipe
        ? 'Complete system data purge executed: All ballots, positions, candidates, and voter rosters cleared for fresh election cycle.'
        : 'New election cycle initialized.',
      'security'
    );
  };

  // User Accounts & RBAC Handlers
  const handleAddAccount = (accountData: Omit<UserAccount, 'id' | 'createdAt'>) => {
    const newAccount: UserAccount = {
      ...accountData,
      id: 'acc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
    };
    persistElectionData((prev) => ({
      ...prev,
      accounts: [...(prev.accounts || []), newAccount],
    }));
    logAuditEvent(
      'admin_login',
      `Staff user account created for ${newAccount.fullName} (${newAccount.role}).`,
      'security'
    );
  };

  const handleUpdateAccount = (updatedAccount: UserAccount) => {
    persistElectionData((prev) => ({
      ...prev,
      accounts: (prev.accounts || []).map((acc) =>
        acc.id === updatedAccount.id ? updatedAccount : acc
      ),
    }));
    if (currentUser?.id === updatedAccount.id) {
      setCurrentUser(updatedAccount);
    }
    logAuditEvent(
      'settings_updated',
      `Staff user credentials/role updated for ${updatedAccount.fullName}.`,
      'security'
    );
  };

  const handleDeleteAccount = (accountId: string) => {
    persistElectionData((prev) => ({
      ...prev,
      accounts: (prev.accounts || []).filter((acc) => acc.id !== accountId),
    }));
    if (currentUser?.id === accountId) {
      const remaining = (data?.accounts || []).filter((acc) => acc.id !== accountId);
      if (remaining.length > 0) {
        setCurrentUser(remaining[0]);
      }
    }
    logAuditEvent('security_alert', 'Staff user account removed from access roster.', 'security');
  };

  const handleSwitchUser = (account: UserAccount) => {
    setCurrentUser(account);
    sounds.playSuccess();
    logAuditEvent('admin_login', `Session context switched to ${account.fullName} (${account.role}).`, 'security');
    if (account.role === 'Agent Monitor') {
      setCurrentView('agents');
    }
  };

  const handleExportBackupJson = () => {
    if (!data) return;
    downloadJSON(
      `election_backup_${data.config.schoolName.replace(/\s+/g, '_')}_${
        new Date().toISOString().split('T')[0]
      }.json`,
      JSON.stringify(data, null, 2)
    );
  };

  const handleImportBackupJson = (importedData: ElectionData) => {
    const normalized = normalizeElectionData(importedData);
    setData(normalized);
    if (normalized.accounts && normalized.accounts.length > 0) {
      setCurrentUser(normalized.accounts[0]);
    }
    saveElectionData(normalized);
    sounds.playSuccess();
    logAuditEvent(
      'settings_updated',
      `Imported complete election backup data from JSON for ${normalized.config.schoolName}.`,
      'election'
    );
  };

  const handleLoadDefaultDemo = () => {
    const defaultData = getDefaultElectionData();
    setData(defaultData);
    if (defaultData.accounts && defaultData.accounts.length > 0) {
      setCurrentUser(defaultData.accounts[0]);
    }
    setStatus('Setup');
    saveStoredElectionStatus('Setup');
    saveElectionStatusToFirestore('Setup', currentUser?.fullName || 'Admin').catch(() => {});
    saveElectionStateToFirestore(defaultData, 'Setup', currentUser?.fullName || 'Admin').catch(() => {});
    saveElectionData(defaultData);
    sounds.playSuccess();
  };

  if (!data || !isStatusChecked) {
    return (
      <div
        id="election-station-loading"
        className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 font-bold text-sm transition-colors"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600 dark:text-slate-400 font-semibold tracking-wide">
            Verifying Election Status & Loading Booth...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-amber-200 selection:text-slate-900 transition-colors duration-200">
      {/* Practice / Demo Watermark Banner */}
      <PracticeBanner
        isPractice={isPractice}
        onExitPractice={() => setIsPractice(false)}
      />

      {/* Main Top Navigation Header */}
      <Header
        config={data.config}
        status={status}
        currentView={currentView}
        onSelectView={(view) => {
          if (!isAdminAuthenticated) {
            // Authenticated student viewing published results can toggle between booth and results
            if (voterResultsViewer && status === 'Results Published') {
              if (view === 'results' || view === 'booth') {
                setCurrentView(view);
                return;
              }
            }
            // Candidate agents and observers can access the live agent monitoring station
            if (view === 'agents') {
              setCurrentView('agents');
              return;
            }
            // Unauthenticated voter is restricted to booth only
            if (view !== 'booth') {
              handleRequestAdminView();
            }
            return;
          }
          if (isAdminAuthenticated) {
            // Agent Monitor is strictly confined to the monitoring station
            if (currentUser?.role === 'Agent Monitor') {
              setCurrentView('agents');
              return;
            }
            if (view === 'admin') {
              handleRequestAdminView();
            } else {
              setCurrentView(view);
            }
            return;
          }
        }}
        isPractice={isPractice}
        onTogglePractice={() => setIsPractice(!isPractice)}
        onRequestAdmin={() => handleRequestAdminView('turnout')}
        onRequestAuditTrail={handleRequestAuditTrailView}
        activeAdminTab={adminActiveTab}
        isAdminAuthenticated={isAdminAuthenticated}
        currentUser={currentUser}
        onLogoutAdmin={handleLogoutAdmin}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
        authenticatedVoter={voterResultsViewer}
        onRequestVoterResultsLogin={() => setIsVoterResultsModalOpen(true)}
        onLogoutVoterResults={() => {
          setVoterResultsViewer(null);
          setCurrentView('booth');
          sounds.playSelect();
        }}
      />

      {/* Main Dynamic View Layout */}
      <main className="flex-1">
        {/* 1. VOTING BOOTH VIEW */}
        {currentView === 'booth' && (
          <BoothBackground
            variant={isVoteConfirmed ? 'confirmation' : !activeVoter ? 'login' : 'ballot'}
            customImageUrl={data.config.customBackgroundUrl}
            customTheme={data.config.backgroundTheme}
          >
            {isVoteConfirmed ? (
              <VoteConfirmation
                voterName={confirmedVoterName}
                isPractice={isPractice}
                onFinish={handleFinishVoteConfirmation}
              />
            ) : !activeVoter ? (
              <VoterLogin
                config={data.config}
                status={status}
                roster={data.voters}
                isPractice={isPractice}
                timeoutNotice={sessionTimeoutNotice}
                onDismissTimeoutNotice={() => setSessionTimeoutNotice(null)}
                onLoginSuccess={handleVoterLoginSuccess}
                onSwitchToAdmin={handleRequestAdminView}
                onAuditLog={logAuditEvent}
                onViewResults={(voter) => {
                  logAuditEvent(
                    'results_accessed',
                    `Student voter ${voter.fullName} (${voter.voterId}) authenticated to view official certified election results.`,
                    'election',
                    {
                      actor: `${voter.fullName} (${voter.voterId})`,
                      actorRole: 'Voter',
                      metadata: { studentId: voter.voterId },
                    }
                  );
                  setVoterResultsViewer(voter);
                  setCurrentView('results');
                }}
              />
            ) : (
              <BallotView
                voter={activeVoter}
                positions={data.positions}
                candidates={data.candidates}
                isPractice={isPractice}
                onReviewBallot={handleReviewBallot}
                onCancel={handleCancelVoterSession}
                onSessionTimeout={handleVoterSessionTimeout}
              />
            )}
          </BoothBackground>
        )}

        {/* 2. ASPIRANT AGENT LIVE MONITORING PIE CHARTS */}
        {currentView === 'agents' && (
          <PageBackground
            theme="agents"
            customImageUrl={data.config.customBackgroundUrl}
            customTheme={data.config.backgroundTheme}
          >
            <AgentMonitoringView
              config={data.config}
              status={status}
              positions={data.positions}
              candidates={data.candidates}
              ballots={data.ballots}
              voters={data.voters}
              currentUser={currentUser}
              permissions={getUserPermissions(currentUser)}
              onReturnToBooth={currentUser?.role === 'Agent Monitor' ? undefined : () => setCurrentView('booth')}
              onLogout={handleLogoutAdmin}
            />
          </PageBackground>
        )}

        {/* 3. ELECTORAL COMMISSION ADMIN PORTAL */}
        {currentView === 'admin' && (
          <PageBackground
            theme="admin"
            customImageUrl={data.config.customBackgroundUrl}
            customTheme={data.config.backgroundTheme}
          >
            <AdminDashboard
              initialTab={adminActiveTab}
              onTabChange={(tab) => setAdminActiveTab(tab)}
              electionData={data}
              status={status}
              currentUser={currentUser}
              onUpdateStatus={handleUpdateStatus}
              onUpdateConfig={handleUpdateConfig}
              onUpdatePositions={handleUpdatePositions}
              onDeletePosition={handleDeletePosition}
              onAddCandidate={handleAddCandidate}
              onUpdateCandidate={handleUpdateCandidate}
              onDeleteCandidate={handleDeleteCandidate}
              onUpdateVoters={handleUpdateVoters}
              onResetVoterStatus={handleResetVoterStatus}
              onStartNewElection={handleStartNewElection}
              onExportBackupJson={handleExportBackupJson}
              onImportBackupJson={handleImportBackupJson}
              onLoadDefaultDemo={handleLoadDefaultDemo}
              onReturnToBooth={() => setCurrentView('booth')}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onSwitchUser={handleSwitchUser}
              onLogout={handleLogoutAdmin}
            />
          </PageBackground>
        )}

        {/* 4. RESULTS & TURNOUT REPORT VIEW */}
        {currentView === 'results' && (
          <PageBackground
            theme="results"
            customImageUrl={data.config.customBackgroundUrl}
            customTheme={data.config.backgroundTheme}
          >
            <ResultsDashboard
              config={data.config}
              status={status}
              positions={data.positions}
              candidates={data.candidates}
              ballots={data.ballots}
              voters={data.voters}
              auditLogs={data.auditLogs}
              isAdmin={isAdminAuthenticated}
              currentUser={currentUser}
              authenticatedVoter={voterResultsViewer}
              onExitVoterResults={() => {
                setVoterResultsViewer(null);
                setCurrentView('booth');
                sounds.playSelect();
              }}
              onPublishToggle={() =>
                handleUpdateStatus(status === 'Results Published' ? 'Closed' : 'Results Published')
              }
              onLogout={handleLogoutAdmin}
            />
          </PageBackground>
        )}
      </main>

      {/* Review Ballot Modal before final submission */}
      {activeVoter && (
        <ReviewBallotModal
          isOpen={isReviewModalOpen}
          voter={activeVoter}
          positions={data.positions}
          candidates={data.candidates}
          choices={pendingChoices}
          isSubmitting={isSubmittingVote}
          onConfirmSubmit={handleConfirmSubmitVote}
          onBackToEdit={() => setIsReviewModalOpen(false)}
          config={data.config}
        />
      )}

      {/* Admin Security Password & Role-Based Gate */}
      <AdminAuthModal
        isOpen={isAdminAuthModalOpen}
        expectedPin={data.config.adminPin}
        accounts={data.accounts || []}
        onSuccess={handleAdminAuthSuccess}
        onCancel={() => setIsAdminAuthModalOpen(false)}
      />

      {/* Voter Results Login Modal */}
      <VoterResultsLoginModal
        isOpen={isVoterResultsModalOpen}
        onClose={() => setIsVoterResultsModalOpen(false)}
        config={data.config}
        status={status}
        roster={data.voters}
        onSuccess={(voter) => {
          setVoterResultsViewer(voter);
          setCurrentView('results');
        }}
      />

      {/* Print-Only Official Certified Document (Shown only in results view) */}
      {currentView === 'results' && (
        <PrintableReport
          config={data.config}
          status={status}
          positions={data.positions}
          candidates={data.candidates}
          ballots={data.ballots}
          voters={data.voters}
          auditLogs={data.auditLogs}
        />
      )}
    </div>
  );
}
