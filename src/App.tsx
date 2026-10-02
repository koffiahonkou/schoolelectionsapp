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
  clearAllStoredElectionData,
  normalizeElectionData,
  downloadJSON,
  saveStoredElectionStatus,
  loadStoredElectionStatus,
  getLocallyVotedVoterIds,
  markVoterLocallyVoted,
  isVoterLocallyMarkedVoted,
  resetVoterLocallyVoted,
  clearAllLocallyVoted,
} from './utils/storage';
import { createChainedAuditEntry } from './utils/cryptoAudit';
import { DEFAULT_USER_ACCOUNTS } from './utils/defaultData';
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
import { isFirebaseConfigured } from './lib/firebase';
import {
  saveAnonymousVoteToFirestore,
  markVoterTokenUsedInFirestore,
  syncVoterRosterToFirestoreTokens,
  clearAllFirestoreElectionData,
  clearAllFirestoreVotes,
  saveElectionStatusToFirestore,
  saveElectionStateToFirestore,
  getElectionMetadataFromFirestore,
  subscribeToElectionMetadata,
  subscribeToElectionStats,
  submitVoteTransaction,
  getRegisteredVoterCount,
  ElectionStatsRecord,
  checkVoterTokenInFirestore,
  resetVoterTokenInFirestore,
  fetchAnonymousVotesOnce,
  fetchVoterTokensOnce,
} from './lib/firebaseVoting';
import { fetchWithBackoff, postJsonWithBackoff } from './utils/apiRetry';

const ACTIVE_VOTER_SESSION_KEY = 'school_election_active_voter_session';

export default function App() {
  const [data, setData] = useState<ElectionData | null>(null);
  const [status, setStatus] = useState<ElectionStatus>(() => {
    const saved = loadStoredElectionStatus();
    return saved || 'Setup';
  });
  const [isStatusChecked, setIsStatusChecked] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);
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

  // 1. Initial Data Loading & Real-Time Syncing (Robust local-first & cloud synchronization)
  useEffect(() => {
    let isMounted = true;

    const initializeData = async () => {
      let resolvedData = false;
      let cloudStatusVerified = false;

      // 1. IMMEDIATELY LOAD LOCAL PERSISTENCE (IndexedDB / localStorage)
      // If local storage has the old mock data ("Accra Academy" or 35 students), ignore it!
      let localData: ElectionData | null = null;
      try {
        localData = await loadElectionData();
        if (
          localData &&
          (localData.config?.schoolName === 'Accra Academy Senior High School' ||
            localData.config?.title === '2026 Student Representative Council Elections' ||
            (Array.isArray(localData.voters) && localData.voters.length === 35))
        ) {
          localData = null;
        }
        if (localData && isMounted) {
          setData(localData);
          resolvedData = true;
          const savedStatus = loadStoredElectionStatus();
          if (savedStatus) {
            setStatus(savedStatus);
          }
        }
      } catch (err) {
        console.warn('[Storage] Could not load from local IndexedDB:', err);
      }

      // Safety timeout: Ensure the app finishes initial status check within 10 seconds
      const safetyTimeout = setTimeout(() => {
        if (isMounted) {
          if (!resolvedData) {
            console.warn('Initial storage load timed out, verifying Firebase connection...');
            if (!isFirebaseConfigured) {
              setFirebaseError(
                'Firebase environment variables missing. Please configure VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_FIRESTORE_DATABASE_ID in Vercel Project Settings.'
              );
            }
          }
          setIsStatusChecked(true);
        }
      }, 10000);

      // 2. CHECK CANONICAL FIREBASE 'election_metadata' CLOUD STATE
      // Allows multi-device real-time sync across Vercel, mobile stations, and admin laptops
      try {
        const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 10000));
        const cloudMeta = await Promise.race([getElectionMetadataFromFirestore(), timeoutPromise]);

        if (cloudMeta && isMounted) {
          if (cloudMeta.status) {
            setStatus(cloudMeta.status);
            saveStoredElectionStatus(cloudMeta.status);
            cloudStatusVerified = true;
          }

          if (Array.isArray(cloudMeta.positions) || cloudMeta.config || Array.isArray(cloudMeta.voters)) {
            const fallback = getDefaultElectionData();
            let baseAccounts = (Array.isArray(cloudMeta.accounts) && cloudMeta.accounts.length > 0)
              ? [...cloudMeta.accounts]
              : (localData?.accounts || [...fallback.accounts]);
            for (const defAcc of fallback.accounts) {
              if (!baseAccounts.some((a) => a.id === defAcc.id || a.role === defAcc.role)) {
                baseAccounts.push(defAcc);
              }
            }

            const cloudHasPositions = Array.isArray(cloudMeta.positions) && cloudMeta.positions.length > 0;
            const localHasPositions = Array.isArray(localData?.positions) && localData.positions.length > 0;
            const isCloudPlaceholder =
              !cloudHasPositions ||
              cloudMeta.config?.title === 'New Student Election' ||
              cloudMeta.config?.title === '2026 Student Representative Council Elections';
            const isLocalCustom =
              localHasPositions &&
              localData?.config?.title &&
              localData.config.title !== '2026 Student Representative Council Elections' &&
              localData.config.title !== 'New Student Election';

            let mergedPositions: Position[];
            let mergedCandidates: Candidate[];
            let mergedVoters: Voter[];
            let mergedConfig: ElectionConfig;

            if (isLocalCustom && isCloudPlaceholder) {
              // Local has real custom election, cloud is blank/placeholder -> preserve local & heal cloud
              mergedConfig = localData!.config;
              mergedPositions = localData!.positions;
              mergedCandidates = localData!.candidates;
              mergedVoters = localData!.voters || [];

              // Non-blocking self-healing push to Firestore
              saveElectionStateToFirestore(localData!, cloudMeta.status || status, 'Self-Healing Engine').catch(() => {});
            } else if (cloudHasPositions) {
              mergedConfig = {
                ...(localData?.config || fallback.config),
                ...(cloudMeta.config || {}),
              };
              mergedPositions = cloudMeta.positions;
              mergedCandidates = Array.isArray(cloudMeta.candidates) ? cloudMeta.candidates : (localData?.candidates || []);
              mergedVoters = Array.isArray(cloudMeta.voters) ? cloudMeta.voters : (localData?.voters || []);
            } else if (localHasPositions) {
              mergedConfig = localData!.config;
              mergedPositions = localData!.positions;
              mergedCandidates = localData!.candidates;
              mergedVoters = localData!.voters || [];
            } else {
              mergedConfig = cloudMeta.config || fallback.config;
              mergedPositions = cloudMeta.positions || [];
              mergedCandidates = cloudMeta.candidates || [];
              mergedVoters = Array.isArray(cloudMeta.voters) ? cloudMeta.voters : [];
            }

            // Fetch live ballots and tokens from Firestore so results and roster are accurate immediately
            let cloudBallots: Ballot[] = [];
            let cloudTokens: any[] = [];
            try {
              const [bRes, tRes] = await Promise.race([
                Promise.all([fetchAnonymousVotesOnce(), fetchVoterTokensOnce()]),
                new Promise<[Ballot[], any[]]>((r) => setTimeout(() => r([[], []]), 2500)),
              ]);
              cloudBallots = bRes;
              cloudTokens = tRes;
            } catch (fetchErr) {
              console.warn('[Firebase] Could not fetch initial votes/tokens:', fetchErr);
            }

            // Sync token participation with voter roster across tokens, metadata, and local cache
            const tokenMap = new Map(cloudTokens.map((t) => [t.voterId?.toUpperCase(), t]));
            const localVotedIds = getLocallyVotedVoterIds();
            const finalizedVoters = mergedVoters.map((v) => {
              const token = tokenMap.get(v.voterId.toUpperCase());
              const isTokenVoted = token && (token.hasVoted || token.status === 'used');
              const isLocalVoted = localVotedIds.has(v.voterId.toUpperCase());
              const isPrevVoted = localData?.voters?.some(
                (lv) => lv.voterId.toUpperCase() === v.voterId.toUpperCase() && lv.hasVoted
              );

              if (v.hasVoted || isTokenVoted || isLocalVoted || isPrevVoted) {
                markVoterLocallyVoted(v.voterId);
                return {
                  ...v,
                  hasVoted: true,
                  votedAt: token?.votedAt || v.votedAt || new Date().toISOString(),
                };
              }
              return v;
            });

            // Merge cloud ballots and local ballots by unique ID so cast votes are never dropped
            const ballotMap = new Map<string, Ballot>();
            (localData?.ballots || []).forEach((b) => ballotMap.set(b.id, b));
            cloudBallots.forEach((b) => ballotMap.set(b.id, b));
            const mergedBallots = Array.from(ballotMap.values());

            const cloudData: ElectionData = {
              config: mergedConfig,
              positions: mergedPositions,
              candidates: mergedCandidates,
              voters: finalizedVoters,
              ballots: mergedBallots,
              auditLogs: localData?.auditLogs && localData.auditLogs.length > 0 ? localData.auditLogs : fallback.auditLogs,
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

      // 3. Optional: Query server if local storage was completely empty (e.g. first visit on new machine)
      if (!resolvedData && isMounted) {
        try {
          const response = await fetchWithBackoff(
            '/api/election',
            { method: 'GET', headers: { Accept: 'application/json' } },
            { maxRetries: 1 }
          );
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
          console.warn('Could not load from /api/election server:', err);
        }
      }

      // 4. If all data sources failed, set explicit error rather than silently loading 35 fake students!
      if (!resolvedData && isMounted) {
        if (!isFirebaseConfigured) {
          setFirebaseError(
            'Firebase connection credentials missing. Please set VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_FIRESTORE_DATABASE_ID in your Vercel Environment Variables.'
          );
        } else {
          setFirebaseError(
            'Unable to connect to the Firebase election database. Please verify your internet connection and Vercel environment variables.'
          );
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
      const metaHasPositions = Array.isArray(meta.positions) && meta.positions.length > 0;
      const isMetaBlankReset = !metaHasPositions || meta.config?.title === 'New Student Election';
      if (metaHasPositions && !isMetaBlankReset) {
        setData((prev) => {
          if (!prev) return prev;
          const rawVoters = Array.isArray(meta.voters) ? meta.voters : prev.voters;
          const localVotedIds = getLocallyVotedVoterIds();
          const mergedVoters = rawVoters.map((v) => {
            const prevV = prev.voters?.find((pv) => pv.voterId.toUpperCase() === v.voterId.toUpperCase());
            const isLocal = localVotedIds.has(v.voterId.toUpperCase());
            if (v.hasVoted || prevV?.hasVoted || isLocal) {
              markVoterLocallyVoted(v.voterId);
              return {
                ...v,
                hasVoted: true,
                votedAt: prevV?.votedAt || v.votedAt || new Date().toISOString(),
              };
            }
            return v;
          });

          const updated: ElectionData = {
            ...prev,
            config: meta.config ? { ...prev.config, ...meta.config } : prev.config,
            positions: meta.positions,
            candidates: meta.candidates,
            voters: mergedVoters,
            accounts: (Array.isArray(meta.accounts) && meta.accounts.length > 0) ? meta.accounts : prev.accounts,
          };
          saveElectionData(updated).catch(() => {});
          return updated;
        });
      }
    });

    // OPTIMIZED REAL-TIME ELECTION STATS LISTENER (QUOTA FIX):
    // Listens ONLY to the single 'election_stats/current' document!
    // Instead of re-reading 400 documents on every vote, all connected devices
    // receive exactly 1 document update containing total votes, turnout, and candidate counts.
    const unsubscribeStats = subscribeToElectionStats((stats) => {
      if (!isMounted) return;
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          config: {
            ...prev.config,
            liveTurnoutPct: stats.turnoutPercentage,
            totalVotesCast: stats.totalVotesCast,
          },
          electionStats: stats,
        };
      });
    });

    // 2. Periodic sync with backoff for server endpoints
    // If /api/election returns 404/405 or fails, it exponentially backs off instead of flooding every 3 seconds.
    let isPolling = false;
    let pollIntervalMs = 15000;
    let pollTimer: any = null;

    const runPoll = async () => {
      if (!isMounted || document.hidden || isPolling) return;
      isPolling = true;
      try {
        const res = await fetchWithBackoff(
          '/api/election',
          { method: 'GET', headers: { Accept: 'application/json' } },
          { maxRetries: 1, initialDelayMs: 2000 }
        );

        if (res.status === 404 || res.status === 405) {
          // Endpoint not deployed or method disabled on current server.
          // Back off to 60s to prevent spamming browser console!
          pollIntervalMs = 60000;
        } else if (res.ok) {
          pollIntervalMs = 15000; // Reset normal interval
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const json = await res.json();
            if (json.success && json.data && isMounted) {
              const isApiPlaceholder =
                !json.data.positions ||
                json.data.positions.length === 0 ||
                json.data.config?.title === 'New Student Election' ||
                json.data.config?.title === '2026 Student Representative Council Elections';

              setData((prev) => {
                if (!prev) return json.data;

                const isPrevCustom =
                  Boolean(prev.positions && prev.positions.length > 0) &&
                  prev.config?.title !== '2026 Student Representative Council Elections' &&
                  prev.config?.title !== 'New Student Election';

                // If client already has a customized live election, never overwrite with placeholder or blank reset!
                if (isPrevCustom && isApiPlaceholder) {
                  return prev;
                }

                // Never overwrite a live election with an empty or placeholder schema
                const prevHasLiveSetup = (prev.positions && prev.positions.length > 0) || isPrevCustom;
                const apiHasSetup = json.data.positions && json.data.positions.length > 0;

                if (prevHasLiveSetup && !apiHasSetup) {
                  return prev;
                }

                // Merge ballots by ID: Never overwrite or lose cast ballots
                const ballotMap = new Map<string, Ballot>();
                (prev.ballots || []).forEach((b) => ballotMap.set(b.id, b));
                (json.data.ballots || []).forEach((b) => ballotMap.set(b.id, b));
                const mergedBallots = Array.from(ballotMap.values());

                // Merge voters: Preserve existing voters and never downgrade hasVoted from true to false
                const sourceVoters = (json.data.voters && json.data.voters.length > 0)
                  ? json.data.voters
                  : (prev.voters || []);
                const localVotedIds = getLocallyVotedVoterIds();
                const mergedVoters = sourceVoters.map((v: Voter) => {
                  const prevV = prev.voters?.find((pv) => pv.voterId.toUpperCase() === v.voterId.toUpperCase());
                  const isLocal = localVotedIds.has(v.voterId.toUpperCase());
                  if (v.hasVoted || prevV?.hasVoted || isLocal) {
                    markVoterLocallyVoted(v.voterId);
                    return {
                      ...v,
                      hasVoted: true,
                      votedAt: prevV?.votedAt || v.votedAt || new Date().toISOString(),
                    };
                  }
                  return v;
                });

                return {
                  ...prev,
                  ...json.data,
                  config: (isPrevCustom && isApiPlaceholder)
                    ? prev.config
                    : {
                        ...prev.config,
                        ...(json.data.config || {}),
                      },
                  positions: (apiHasSetup && !isApiPlaceholder) ? json.data.positions : (prev.positions || []),
                  candidates: (json.data.candidates && json.data.candidates.length > 0 && !isApiPlaceholder) ? json.data.candidates : (prev.candidates || []),
                  voters: mergedVoters,
                  ballots: mergedBallots,
                  accounts: (json.data.accounts && json.data.accounts.length > 0) ? json.data.accounts : (prev.accounts && prev.accounts.length > 0 ? prev.accounts : DEFAULT_USER_ACCOUNTS),
                };
              });

              // Update status from polling if valid live election and no local commissioner status is explicitly stored
              if (json.status && !isApiPlaceholder) {
                setStatus((cur) => {
                  const stored = loadStoredElectionStatus();
                  if (stored) return stored; // Respect stored commissioner intent
                  if (cur === json.status) return cur;
                  saveStoredElectionStatus(json.status);
                  return json.status;
                });
              }
            }
          }
        }
      } catch (pollErr) {
        // Increase backoff delay on network failure
        pollIntervalMs = Math.min(pollIntervalMs * 1.5, 60000);
      } finally {
        isPolling = false;
        if (isMounted) {
          pollTimer = setTimeout(runPoll, pollIntervalMs);
        }
      }
    };

    pollTimer = setTimeout(runPoll, 5000);

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
      unsubscribeMeta();
      unsubscribeStats();
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
      postJsonWithBackoff('/api/election/update', { data: updated }).catch((err) =>
        console.warn('Server sync error on election update:', err)
      );

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

      // 1. Send to server using backoff protection to calculate canonical SHA-256 hash and persist to disk
      postJsonWithBackoff('/api/audit/log', payload)
        .then((res) => {
          if (res.success && res.data?.entry) {
            setData((prev) => {
              if (!prev) return prev;
              if (prev.auditLogs.some((l) => l.id === res.data.entry.id)) return prev;
              const updated = {
                ...prev,
                auditLogs: [...prev.auditLogs, res.data.entry],
              };
              saveElectionData(updated).catch(() => {});
              return updated;
            });
          } else {
            // Local cryptographic chain fallback if server endpoint unavailable or 404/405
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

    // Also sync to backend (if available) with backoff protection
    postJsonWithBackoff('/api/election/update', { status: newStatus }).catch(() => {});

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

    // Multi-layer double-voting guard: local storage cache, in-memory roster, and Firestore
    if (!isPractice) {
      const isAlreadyVotedLocally = isVoterLocallyMarkedVoted(activeVoter.voterId);
      const currentVoterRecord = data.voters.find(
        (v) => v.voterId.toUpperCase() === activeVoter.voterId.toUpperCase()
      );
      if (currentVoterRecord?.hasVoted || isAlreadyVotedLocally) {
        logAuditEvent(
          'security_alert',
          `DOUBLE-VOTING BLOCKED: Student ID "${activeVoter.voterId}" attempted to cast a duplicate ballot. Attempt blocked.`,
          'security',
          { actor: `Student ID: ${activeVoter.voterId}`, actorRole: 'Voter' }
        );
        handleCancelVoterSession();
        return;
      }

      try {
        const tokenCheck = await checkVoterTokenInFirestore(activeVoter.voterId);
        if (tokenCheck.hasVoted) {
          markVoterLocallyVoted(activeVoter.voterId);
          logAuditEvent(
            'security_alert',
            `DOUBLE-VOTING BLOCKED (Firestore verified): Student ID "${activeVoter.voterId}" attempted to cast a duplicate ballot. Attempt blocked.`,
            'security',
            { actor: `Student ID: ${activeVoter.voterId}`, actorRole: 'Voter' }
          );
          handleCancelVoterSession();
          return;
        }
      } catch (checkErr) {
        console.warn('Real-time token check warning:', checkErr);
      }
    }

    setIsSubmittingVote(true);
    const voterName = activeVoter.fullName;
    const voterId = activeVoter.voterId;
    const pin = activeVoter.pin;

    // Submit to server online vote endpoint (handled with atomic queue mutex)
    try {
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterId,
          passcode: pin,
          choices: pendingChoices,
          isPractice,
          captchaVerified: true,
        }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        setIsSubmittingVote(false);
        if (response.status === 409) {
          if (!isPractice && voterId) markVoterLocallyVoted(voterId);
          handleCancelVoterSession();
        }
        return;
      }

      // Mark locally voted immediately to guarantee no second ballot can be cast
      if (!isPractice && voterId) {
        markVoterLocallyVoted(voterId);
      }

      // Live state successfully updated on online server
      if (resData.data) {
        const castBallot = resData.data.ballots[resData.data.ballots.length - 1];
        if (castBallot) {
          await saveAnonymousVoteToFirestore(castBallot).catch((err) =>
            console.warn('[Firebase] Firestore vote sync warning:', err)
          );
        }
        if (!isPractice && voterId) {
          await markVoterTokenUsedInFirestore(voterId).catch((err) =>
            console.warn('[Firebase] Firestore token sync warning:', err)
          );
        }

        setData((prev) => {
          if (!prev) return resData.data;
          const ballotMap = new Map<string, Ballot>();
          (prev.ballots || []).forEach((b) => ballotMap.set(b.id, b));
          (resData.data.ballots || []).forEach((b: Ballot) => ballotMap.set(b.id, b));
          const mergedBallots = Array.from(ballotMap.values());

          const mergedVoters = (resData.data.voters || prev.voters || []).map((v: Voter) =>
            v.voterId.toUpperCase() === voterId.toUpperCase()
              ? { ...v, hasVoted: true, votedAt: castBallot?.submittedAt || new Date().toISOString() }
              : v
          );

          const updated: ElectionData = {
            ...resData.data,
            ballots: mergedBallots,
            voters: mergedVoters,
          };
          saveElectionData(updated).catch(() => {});
          return updated;
        });
      } else {
        // Online serverless confirmation (e.g. Vercel /api/vote)
        const newBallot: Ballot = {
          id: resData.ballotId || ('bal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
          submittedAt: resData.timestamp || new Date().toISOString(),
          isPractice,
          choices: { ...pendingChoices },
        };

        persistElectionData((prev) => {
          const updatedVoters = isPractice
            ? prev.voters
            : prev.voters.map((v) =>
                v.voterId.toUpperCase() === activeVoter.voterId.toUpperCase()
                  ? { ...v, hasVoted: true, votedAt: newBallot.submittedAt }
                  : v
              );

          const ballotMap = new Map<string, Ballot>();
          (prev.ballots || []).forEach((b) => ballotMap.set(b.id, b));
          ballotMap.set(newBallot.id, newBallot);
          const updatedBallots = Array.from(ballotMap.values());

          const auditEntry = createChainedAuditEntry(prev.auditLogs, {
            eventType: 'ballot_submitted',
            details: isPractice
              ? 'Demo practice ballot cast.'
              : `Official anonymous ballot deposited online. Total ballots: ${
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
      }
    } catch (networkErr) {
      console.warn('Online server endpoint unreachable, submitting directly via Firestore runTransaction:', networkErr);

      if (!isPractice && voterId) {
        markVoterLocallyVoted(voterId);
      }

      // Direct Firestore Transaction Fallback
      let txBallotId = 'bal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      if (!isPractice && voterId) {
        const txRes = await submitVoteTransaction(
          voterId,
          pin || '',
          pendingChoices,
          false
        );
        if (!txRes.success) {
          console.warn('Direct Firestore voting transaction error:', txRes.error);
        } else if (txRes.ballotId) {
          txBallotId = txRes.ballotId;
        }
      }

      const newBallot: Ballot = {
        id: txBallotId,
        submittedAt: new Date().toISOString(),
        isPractice,
        choices: { ...pendingChoices },
      };

      persistElectionData((prev) => {
        const updatedVoters = isPractice
          ? prev.voters
          : prev.voters.map((v) =>
              v.voterId.toUpperCase() === activeVoter.voterId.toUpperCase()
                ? { ...v, hasVoted: true, votedAt: newBallot.submittedAt }
                : v
            );

        const ballotMap = new Map<string, Ballot>();
        (prev.ballots || []).forEach((b) => ballotMap.set(b.id, b));
        ballotMap.set(newBallot.id, newBallot);
        const updatedBallots = Array.from(ballotMap.values());

        const auditEntry = createChainedAuditEntry(prev.auditLogs, {
          eventType: 'ballot_submitted',
          details: isPractice
            ? 'Demo practice ballot cast.'
            : `Official anonymous ballot deposited (offline fallback). Total ballots: ${
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
    const permissions = getUserPermissions(currentUser);
    if (!permissions.canManageBallot && currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to update positions.');
      return;
    }
    persistElectionData((prev) => ({
      ...prev,
      positions,
    }));
    logAuditEvent('positions_updated', `Ballot positions updated (${positions.length} active).`, 'election');
  };

  const handleDeletePosition = (positionId: string) => {
    const permissions = getUserPermissions(currentUser);
    if (!permissions.canManageBallot && currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to delete position.');
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
    const permissions = getUserPermissions(currentUser);
    if (!permissions.canManageBallot && currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to add candidate.');
      return;
    }
    persistElectionData((prev) => ({
      ...prev,
      candidates: [...prev.candidates, cand],
    }));
    logAuditEvent('candidates_updated', `Registered candidate ${cand.name}.`, 'election');
  };

  const handleUpdateCandidate = (cand: Candidate) => {
    const permissions = getUserPermissions(currentUser);
    if (!permissions.canManageBallot && currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to update candidate.');
      return;
    }
    persistElectionData((prev) => ({
      ...prev,
      candidates: prev.candidates.map((c) => (c.id === cand.id ? cand : c)),
    }));
    logAuditEvent('candidates_updated', `Updated profile for candidate ${cand.name}.`, 'election');
  };

  const handleDeleteCandidate = (candId: string) => {
    const permissions = getUserPermissions(currentUser);
    if (!permissions.canManageBallot && currentUser?.role !== 'Developer') {
      console.warn('Unauthorized attempt to delete candidate.');
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
    const target = data?.voters.find(
      (v) => v.id === voterId || v.voterId.toUpperCase() === voterId.toUpperCase()
    );
    if (target) {
      resetVoterLocallyVoted(target.voterId);
      resetVoterTokenInFirestore(target.voterId).catch(() => {});
    }
    persistElectionData((prev) => ({
      ...prev,
      voters: prev.voters.map((v) =>
        v.id === voterId || v.voterId.toUpperCase() === voterId.toUpperCase()
          ? { ...v, hasVoted: false, votedAt: null }
          : v
      ),
    }));
    logAuditEvent('roster_modified', `Reset hasVoted status for student in roster.`, 'roster');
  };

  const handleStartNewElection = async (clearRoster: boolean, isFullSystemWipe = false) => {
    const actor = currentUser?.fullName || 'Admin';
    clearAllLocallyVoted();

    const empty = createEmptyElectionData(
      isFullSystemWipe ? 'New Student Election' : (data?.config.title || 'New Student Election'),
      isFullSystemWipe ? (data?.config.schoolName || 'Our School') : (data?.config.schoolName || 'Our School')
    );
    empty.ballots = [];

    // If starting a fresh cycle without a full wipe, preserve existing ballot positions & candidates
    if (!isFullSystemWipe && data) {
      empty.positions = data.positions;
      empty.candidates = data.candidates;
      empty.config = { ...data.config };
    }

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
      empty.auditLogs = [];
    }
    // Retain registered staff accounts across resets
    if (data?.accounts) {
      empty.accounts = data.accounts;
    }

    // 1. Immediately wipe and update local application state
    setData(empty);
    setStatus('Setup');
    saveStoredElectionStatus('Setup');

    if (isFullSystemWipe) {
      clearAllStoredElectionData().catch(() => {});
    }
    await saveElectionData(empty).catch(() => {});

    // 2. Asynchronously propagate wipe to cloud Firestore & serverless endpoints
    // (Never block the local UI modal on cloud network delays or quota limits!)
    const cloudPurge = isFullSystemWipe || clearRoster
      ? clearAllFirestoreElectionData(empty.accounts)
      : clearAllFirestoreVotes();

    cloudPurge.catch((err) => console.warn('[Storage] Background cloud clear warning:', err));
    saveElectionStatusToFirestore('Setup', actor).catch(() => {});
    saveElectionStateToFirestore(empty, 'Setup', actor).catch(() => {});

    postJsonWithBackoff('/api/election/reset', {
      title: empty.config.title,
      school: empty.config.schoolName,
      actor,
      confirmationKey: 'CONFIRM_RESET_ELECTION',
    }).catch(() => {});

    postJsonWithBackoff('/api/election/update', {
      data: empty,
      status: 'Setup',
      actor,
      actionDescription: isFullSystemWipe ? 'Full system data purge' : 'New election cycle initialized',
    }).catch(() => {});

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
    if (firebaseError && !data) {
      return (
        <div
          id="election-station-error"
          className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6"
        >
          <div className="max-w-lg w-full bg-slate-900 border border-rose-500/40 rounded-3xl p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-black text-rose-300">Firebase Connection Required</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                {firebaseError}
              </p>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-left text-xs font-mono text-slate-300 space-y-2">
              <div className="text-amber-400 font-bold">Vercel Environment Variables Needed:</div>
              <div>• VITE_FIREBASE_API_KEY</div>
              <div>• VITE_FIREBASE_PROJECT_ID</div>
              <div>• VITE_FIREBASE_FIRESTORE_DATABASE_ID</div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      );
    }

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
