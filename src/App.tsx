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

  // Dark Mode state
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
    } catch {}
  }, [isDarkMode]);

  const handleToggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
    sounds.playSelect();
  }, []);

  // Strict Access Control
  useEffect(() => {
    if (!isAdminAuthenticated) {
      const isAllowedResults = voterResultsViewer && status === 'Results Published' && currentView === 'results';
      const isAllowedAgents = currentView === 'agents';
      if (currentView !== 'booth' && !isAllowedResults && !isAllowedAgents) {
        setCurrentView('booth');
      }
    }
  }, [isAdminAuthenticated, voterResultsViewer, status, currentView]);

  useEffect(() => {
    if (status !== 'Results Published' && voterResultsViewer) {
      setVoterResultsViewer(null);
      if (currentView === 'results' && !isAdminAuthenticated) {
        setCurrentView('booth');
      }
    }
  }, [status, voterResultsViewer, currentView, isAdminAuthenticated]);

  // 1. Initial Data Loading & Real-Time Syncing (via Supabase polling)
  useEffect(() => {
    let isMounted = true;

    const initializeData = async () => {
      try {
        const loaded = await loadElectionData();
        if (isMounted) {
          setData(loaded);
          const savedStatus = loadStoredElectionStatus();
          if (savedStatus) setStatus(savedStatus);
          setIsStatusChecked(true);
        }
      } catch (error) {
        console.error("Failed to load from Supabase:", error);
        if (isMounted) {
          setData(getDefaultElectionData());
          setIsStatusChecked(true);
        }
      }
    };

    initializeData();

    // Sync every 5 seconds to keep all browsers in sync
    const syncInterval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const latestData = await loadElectionData();
        if (isMounted) {
          setData((prev) => {
            if (!prev) return latestData;
            // Only update if data actually changed to prevent unnecessary re-renders
            if (JSON.stringify(prev) !== JSON.stringify(latestData)) {
              return latestData;
            }
            return prev;
          });
        }
      } catch {
        // silent catch on network hiccups
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
    };
  }, []);

  // Restore active voter session on page reload
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
            if (session.isPractice !== undefined) setIsPractice(session.isPractice);
            return;
          }
        }
      }
      sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY);
    } catch {}
  }, [data, activeVoter]);

  // Persist state to Supabase
  const persistElectionData = useCallback((updater: (prev: ElectionData) => ElectionData) => {
    setData((prev) => {
      if (!prev) return prev;
      const updated = updater(prev);
      saveElectionData(updated).catch((err) =>
        console.error('Error saving election data to Supabase:', err)
      );
      return updated;
    });
  }, []);

  // Log an audit event with SHA-256 cryptographic chain
  const logAuditEvent = useCallback(
    (
      eventType: AuditLogEntry['eventType'],
      details: string,
      category: AuditLogEntry['category'],
      extra?: { actor?: string; actorRole?: string; metadata?: Record<string, any>; }
    ) => {
      const defaultActor = currentUser ? currentUser.fullName || currentUser.username : (activeVoter ? `${activeVoter.fullName} (${activeVoter.voterId})` : 'System');
      const defaultRole = currentUser ? currentUser.role : (activeVoter ? 'Voter' : 'System');

      const payload = {
        eventType, details, category,
        actor: extra?.actor || defaultActor,
        actorRole: extra?.actorRole || defaultRole,
        metadata: extra?.metadata,
      };

      setData((prev) => {
        if (!prev) return prev;
        const entry = createChainedAuditEntry(prev.auditLogs, payload);
        const updated = { ...prev, auditLogs: [...prev.auditLogs, entry] };
        saveElectionData(updated).catch(() => {});
        return updated;
      });
    },
    [currentUser, activeVoter]
  );

  // 2. Election Status Transitions
  const handleUpdateStatus = (newStatus: ElectionStatus) => {
    setStatus(newStatus);
    saveStoredElectionStatus(newStatus);

    let eventType: AuditLogEntry['eventType'] = 'voting_opened';
    let details = `Election status shifted to ${newStatus}.`;

    if (newStatus === 'Open') { eventType = 'voting_opened'; details = 'Voting stations opened by Electoral Commission.'; }
    else if (newStatus === 'Closed') { eventType = 'voting_closed'; details = 'Voting stations closed. Ballots locked.'; }
    else if (newStatus === 'Results Published') { eventType = 'results_published'; details = 'Official certified results published for public viewing.'; }
    else if (newStatus === 'Setup') { eventType = 'setup_unlocked'; details = 'Ballot setup mode unlocked by Administrator.'; }

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
      sessionStorage.setItem(ACTIVE_VOTER_SESSION_KEY, JSON.stringify({ voter, isPractice, loginTime: Date.now() }));
    } catch {}

    logAuditEvent('voter_login', isPractice ? `Demo practice voting session started for ${voter.fullName} (${voter.voterId}).` : `Student voter authenticated at booth: ${voter.fullName} (ID: ${voter.voterId}). Identity verified.`, 'ballot', { actor: `${voter.fullName} (${voter.voterId})`, actorRole: 'Voter', metadata: { studentId: voter.voterId, isPractice } });
  };

  const handleReviewBallot = (choices: Record<string, string>) => {
    setPendingChoices(choices);
    setIsReviewModalOpen(true);
  };

  const handleCancelVoterSession = () => {
    if (activeVoter) {
      clearBallotAutosave(activeVoter.voterId);
      logAuditEvent('voter_session_cancelled', `Voting booth session cancelled by voter ${activeVoter.fullName} (${activeVoter.voterId}) before depositing ballot.`, 'ballot', { actor: `${activeVoter.fullName} (${activeVoter.voterId})`, actorRole: 'Voter', metadata: { studentId: activeVoter.voterId } });
    }
    try { sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY); } catch {}
    setActiveVoter(null); setPendingChoices({}); setIsReviewModalOpen(false); setIsVoteConfirmed(false);
  };

  const handleVoterSessionTimeout = () => {
    if (activeVoter) {
      const studentName = activeVoter.fullName;
      const studentId = activeVoter.voterId;
      clearBallotAutosave(studentId);
      try { sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY); } catch {}
      setActiveVoter(null); setPendingChoices({}); setIsReviewModalOpen(false); setIsVoteConfirmed(false);
      setSessionTimeoutNotice(`Voting session automatically timed out after 3 minutes of inactivity to protect your ballot secrecy. Please log in again to cast your ballot.`);
      logAuditEvent('voter_session_timeout', `Voting booth session automatically closed due to 3-minute idle timeout on ballot for student ${studentName} (${studentId}).`, 'security', { actor: `${studentName} (${studentId})`, actorRole: 'Voter', metadata: { studentId } });
      sounds.playError();
    }
  };

  // Critical Secret Ballot Submission
  const handleConfirmSubmitVote = async () => {
    if (!data || !activeVoter) return;

    if (!isPractice) {
      const currentVoterRecord = data.voters.find((v) => v.voterId.toUpperCase() === activeVoter.voterId.toUpperCase());
      if (currentVoterRecord?.hasVoted) {
        alert('This student ID has already cast a vote in this election.');
        handleCancelVoterSession();
        return;
      }
    }

    setIsSubmittingVote(true);
    const voterName = activeVoter.fullName;
    const voterId = activeVoter.voterId;

    const newBallot: Ballot = {
      id: 'bal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      submittedAt: new Date().toISOString(),
      isPractice,
      choices: { ...pendingChoices },
    };

    persistElectionData((prev) => {
      const updatedVoters = isPractice ? prev.voters : prev.voters.map((v) => v.voterId.toUpperCase() === activeVoter.voterId.toUpperCase() ? { ...v, hasVoted: true, votedAt: new Date().toISOString() } : v);
      const updatedBallots = [...prev.ballots, newBallot];
      const auditEntry = createChainedAuditEntry(prev.auditLogs, {
        eventType: 'ballot_submitted',
        details: isPractice ? 'Demo practice ballot cast.' : `Official anonymous ballot deposited. Total ballots: ${updatedBallots.filter((b) => !b.isPractice).length}/${prev.voters.length}.`,
        category: 'ballot',
        actor: 'Confidential Ballot Box',
        actorRole: 'Voter',
        metadata: { isPractice, ballotId: newBallot.id, totalCast: updatedBallots.filter((b) => !b.isPractice).length, totalEligible: prev.voters.length },
      });

      return { ...prev, voters: updatedVoters, ballots: updatedBallots, auditLogs: [...prev.auditLogs, auditEntry] };
    });

    clearBallotAutosave(voterId);
    try { sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY); } catch {}

    sounds.playSuccess();
    setIsSubmittingVote(false); setIsReviewModalOpen(false); setConfirmedVoterName(voterName); setIsVoteConfirmed(true); setActiveVoter(null);
  };

  const handleFinishVoteConfirmation = useCallback(() => {
    try { sessionStorage.removeItem(ACTIVE_VOTER_SESSION_KEY); } catch {}
    setIsVoteConfirmed(false); setActiveVoter(null); setPendingChoices({});
  }, []);

  // 4. Admin Management Handlers
  const [adminActiveTab, setAdminActiveTab] = useState<'turnout' | 'agentCharts' | 'accounts' | 'positions' | 'candidates' | 'roster' | 'settings' | 'audit'>('turnout');

  const handleRequestAdminView = (targetTab: 'turnout' | 'agentCharts' | 'accounts' | 'positions' | 'candidates' | 'roster' | 'settings' | 'audit' = 'turnout') => {
    const isDeveloper = currentUser?.role === 'Developer';
    const isRestrictedTab = targetTab === 'accounts' || targetTab === 'settings';
    const safeTab = isRestrictedTab && !isDeveloper ? 'turnout' : targetTab;
    setAdminActiveTab(safeTab);
    if (isAdminAuthenticated) {
      if (currentUser?.role === 'Agent Monitor') setCurrentView('agents');
      else setCurrentView('admin');
    } else {
      setIsAdminAuthModalOpen(true);
    }
  };

  const handleRequestAuditTrailView = () => handleRequestAdminView('audit');

  const handleAdminAuthSuccess = (authenticatedAccount?: UserAccount) => {
    setIsAdminAuthenticated(true);
    const userToSet = authenticatedAccount || (!currentUser && data?.accounts && data.accounts.length > 0 ? data.accounts[0] : null);
    if (userToSet) setCurrentUser(userToSet);
    setIsAdminAuthModalOpen(false);

    if (userToSet?.role === 'Agent Monitor') { setCurrentView('agents'); return; }
    if (userToSet?.role !== 'Developer' && (adminActiveTab === 'accounts' || adminActiveTab === 'settings')) { setAdminActiveTab('turnout'); }
    setCurrentView('admin');
  };

  const handleLogoutAdmin = () => {
    const actorName = currentUser ? currentUser.fullName || currentUser.username : 'Staff Member';
    const actorRole = currentUser?.role || 'Staff';
    logAuditEvent('admin_logout', `Staff session ended for ${actorName} (${actorRole}). Terminal locked and returned to Voter Booth.`, 'security', { actor: actorName, actorRole });
    setIsAdminAuthenticated(false); setCurrentUser(null); setCurrentView('booth'); sounds.playSelect();
  };

  const handleUpdateConfig = (updatedConfig: ElectionConfig) => {
    persistElectionData((prev) => ({ ...prev, config: updatedConfig }));
    logAuditEvent('settings_updated', 'Election configuration, dates and closing parameters updated.', 'security');
  };

  const handleUpdatePositions = (positions: Position[]) => {
    if (currentUser?.role !== 'Developer') return;
    persistElectionData((prev) => ({ ...prev, positions }));
    logAuditEvent('positions_updated', `Ballot positions updated (${positions.length} active).`, 'election');
  };

  const handleDeletePosition = (positionId: string) => {
    if (currentUser?.role !== 'Developer') return;
    persistElectionData((prev) => ({ ...prev, positions: prev.positions.filter((p) => p.id !== positionId), candidates: prev.candidates.filter((c) => c.positionId !== positionId) }));
    logAuditEvent('positions_updated', `Ballot position and associated candidates deleted.`, 'election');
  };

  const handleAddCandidate = (cand: Candidate) => {
    if (currentUser?.role !== 'Developer') return;
    persistElectionData((prev) => ({ ...prev, candidates: [...prev.candidates, cand] }));
    logAuditEvent('candidates_updated', `Registered candidate ${cand.name}.`, 'election');
  };

  const handleUpdateCandidate = (cand: Candidate) => {
    if (currentUser?.role !== 'Developer') return;
    persistElectionData((prev) => ({ ...prev, candidates: prev.candidates.map((c) => (c.id === cand.id ? cand : c)) }));
    logAuditEvent('candidates_updated', `Updated profile for candidate ${cand.name}.`, 'election');
  };

  const handleDeleteCandidate = (candId: string) => {
    if (currentUser?.role !== 'Developer') return;
    persistElectionData((prev) => ({ ...prev, candidates: prev.candidates.filter((c) => c.id !== candId) }));
    logAuditEvent('candidates_updated', `Candidate removed from ballot.`, 'election');
  };

  const handleUpdateVoters = (voters: Voter[], logMessage: string) => {
    persistElectionData((prev) => ({ ...prev, voters }));
    logAuditEvent('roster_imported', logMessage, 'roster');
  };

  const handleResetVoterStatus = (voterId: string) => {
    persistElectionData((prev) => ({ ...prev, voters: prev.voters.map((v) => v.id === voterId ? { ...v, hasVoted: false, votedAt: null } : v) }));
    logAuditEvent('roster_modified', `Reset hasVoted status for student in roster.`, 'roster');
  };

  const handleStartNewElection = async (clearRoster: boolean, isFullSystemWipe = false) => {
    const empty = createEmptyElectionData(isFullSystemWipe ? 'New Student Election' : (data?.config.title || 'New Student Election'), isFullSystemWipe ? (data?.config.schoolName || 'Our School') : (data?.config.schoolName || 'Our School'));
    if (!clearRoster && !isFullSystemWipe && data?.voters) { empty.voters = data.voters.map((v) => ({ ...v, hasVoted: false, votedAt: null })); }
    if (isFullSystemWipe || clearRoster) { empty.voters = []; }
    if (isFullSystemWipe) { empty.positions = []; empty.candidates = []; empty.ballots = []; }
    if (data?.accounts) { empty.accounts = data.accounts; }
    
    setData(empty);
    setStatus('Setup');
    saveStoredElectionStatus('Setup');
    await saveElectionData(empty);
    sounds.playSelect();
    logAuditEvent('settings_updated', isFullSystemWipe ? 'Complete system data purge executed: All ballots, positions, candidates, and voter rosters cleared for fresh election cycle.' : 'New election cycle initialized.', 'security');
  };

  const handleAddAccount = (accountData: Omit<UserAccount, 'id' | 'createdAt'>) => {
    const newAccount: UserAccount = { ...accountData, id: 'acc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6), createdAt: new Date().toISOString() };
    persistElectionData((prev) => ({ ...prev, accounts: [...(prev.accounts || []), newAccount] }));
    logAuditEvent('admin_login', `Staff user account created for ${newAccount.fullName} (${newAccount.role}).`, 'security');
  };

  const handleUpdateAccount = (updatedAccount: UserAccount) => {
    persistElectionData((prev) => ({ ...prev, accounts: (prev.accounts || []).map((acc) => acc.id === updatedAccount.id ? updatedAccount : acc) }));
    if (currentUser?.id === updatedAccount.id) setCurrentUser(updatedAccount);
    logAuditEvent('settings_updated', `Staff user credentials/role updated for ${updatedAccount.fullName}.`, 'security');
  };

  const handleDeleteAccount = (accountId: string) => {
    persistElectionData((prev) => ({ ...prev, accounts: (prev.accounts || []).filter((acc) => acc.id !== accountId) }));
    if (currentUser?.id === accountId) {
      const remaining = (data?.accounts || []).filter((acc) => acc.id !== accountId);
      if (remaining.length > 0) setCurrentUser(remaining[0]);
    }
    logAuditEvent('security_alert', 'Staff user account removed from access roster.', 'security');
  };

  const handleSwitchUser = (account: UserAccount) => {
    setCurrentUser(account); sounds.playSuccess();
    logAuditEvent('admin_login', `Session context switched to ${account.fullName} (${account.role}).`, 'security');
    if (account.role === 'Agent Monitor') setCurrentView('agents');
  };

  const handleExportBackupJson = () => {
    if (!data) return;
    downloadJSON(`election_backup_${data.config.schoolName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`, JSON.stringify(data, null, 2));
  };

  const handleImportBackupJson = (importedData: ElectionData) => {
    const normalized = normalizeElectionData(importedData);
    setData(normalized);
    if (normalized.accounts && normalized.accounts.length > 0) setCurrentUser(normalized.accounts[0]);
    saveElectionData(normalized);
    sounds.playSuccess();
    logAuditEvent('settings_updated', `Imported complete election backup data from JSON for ${normalized.config.schoolName}.`, 'election');
  };

  const handleLoadDefaultDemo = () => {
    const defaultData = getDefaultElectionData();
    setData(defaultData);
    if (defaultData.accounts && defaultData.accounts.length > 0) setCurrentUser(defaultData.accounts[0]);
    setStatus('Setup'); saveStoredElectionStatus('Setup');
    saveElectionData(defaultData);
    sounds.playSuccess();
  };

  if (!data || !isStatusChecked) {
    return (
      <div id="election-station-loading" className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 font-bold text-sm transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600 dark:text-slate-400 font-semibold tracking-wide">Verifying Election Status & Loading Booth...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-amber-200 selection:text-slate-900 transition-colors duration-200">
      <PracticeBanner isPractice={isPractice} onExitPractice={() => setIsPractice(false)} />
      <Header
        config={data.config} status={status} currentView={currentView}
        onSelectView={(view) => {
          if (!isAdminAuthenticated) {
            if (voterResultsViewer && status === 'Results Published' && (view === 'results' || view === 'booth')) { setCurrentView(view); return; }
            if (view === 'agents') { setCurrentView('agents'); return; }
            if (view !== 'booth') handleRequestAdminView();
            return;
          }
          if (isAdminAuthenticated) {
            if (currentUser?.role === 'Agent Monitor') { setCurrentView('agents'); return; }
            if (view === 'admin') handleRequestAdminView(); else setCurrentView(view);
            return;
          }
        }}
        isPractice={isPractice} onTogglePractice={() => setIsPractice(!isPractice)} onRequestAdmin={() => handleRequestAdminView('turnout')} onRequestAuditTrail={handleRequestAuditTrailView} activeAdminTab={adminActiveTab} isAdminAuthenticated={isAdminAuthenticated} currentUser={currentUser} onLogoutAdmin={handleLogoutAdmin} isDarkMode={isDarkMode} onToggleDarkMode={handleToggleDarkMode} authenticatedVoter={voterResultsViewer} onRequestVoterResultsLogin={() => setIsVoterResultsModalOpen(true)}
        onLogoutVoterResults={() => { setVoterResultsViewer(null); setCurrentView('booth'); sounds.playSelect(); }}
      />

      <main className="flex-1">
        {currentView === 'booth' && (
          <BoothBackground variant={isVoteConfirmed ? 'confirmation' : !activeVoter ? 'login' : 'ballot'} customImageUrl={data.config.customBackgroundUrl} customTheme={data.config.backgroundTheme}>
            {isVoteConfirmed ? (
              <VoteConfirmation voterName={confirmedVoterName} isPractice={isPractice} onFinish={handleFinishVoteConfirmation} />
            ) : !activeVoter ? (
              <VoterLogin config={data.config} status={status} roster={data.voters} isPractice={isPractice} timeoutNotice={sessionTimeoutNotice} onDismissTimeoutNotice={() => setSessionTimeoutNotice(null)} onLoginSuccess={handleVoterLoginSuccess} onSwitchToAdmin={handleRequestAdminView} onAuditLog={logAuditEvent}
                onViewResults={(voter) => {
                  logAuditEvent('results_accessed', `Student voter ${voter.fullName} (${voter.voterId}) authenticated to view official certified election results.`, 'election', { actor: `${voter.fullName} (${voter.voterId})`, actorRole: 'Voter', metadata: { studentId: voter.voterId } });
                  setVoterResultsViewer(voter); setCurrentView('results');
                }}
              />
            ) : (
              <BallotView voter={activeVoter} positions={data.positions} candidates={data.candidates} isPractice={isPractice} onReviewBallot={handleReviewBallot} onCancel={handleCancelVoterSession} onSessionTimeout={handleVoterSessionTimeout} />
            )}
          </BoothBackground>
        )}

        {currentView === 'agents' && (
          <PageBackground theme="agents" customImageUrl={data.config.customBackgroundUrl} customTheme={data.config.backgroundTheme}>
            <AgentMonitoringView config={data.config} status={status} positions={data.positions} candidates={data.candidates} ballots={data.ballots} voters={data.voters} currentUser={currentUser} permissions={getUserPermissions(currentUser)} onReturnToBooth={currentUser?.role === 'Agent Monitor' ? undefined : () => setCurrentView('booth')} onLogout={handleLogoutAdmin} />
          </PageBackground>
        )}

        {currentView === 'admin' && (
          <PageBackground theme="admin" customImageUrl={data.config.customBackgroundUrl} customTheme={data.config.backgroundTheme}>
            <AdminDashboard
              initialTab={adminActiveTab} onTabChange={(tab) => setAdminActiveTab(tab)} electionData={data} status={status} currentUser={currentUser} onUpdateStatus={handleUpdateStatus} onUpdateConfig={handleUpdateConfig} onUpdatePositions={handleUpdatePositions} onDeletePosition={handleDeletePosition} onAddCandidate={handleAddCandidate} onUpdateCandidate={handleUpdateCandidate} onDeleteCandidate={handleDeleteCandidate} onUpdateVoters={handleUpdateVoters} onResetVoterStatus={handleResetVoterStatus} onStartNewElection={handleStartNewElection} onExportBackupJson={handleExportBackupJson} onImportBackupJson={handleImportBackupJson} onLoadDefaultDemo={handleLoadDefaultDemo} onReturnToBooth={() => setCurrentView('booth')} onAddAccount={handleAddAccount} onUpdateAccount={handleUpdateAccount} onDeleteAccount={handleDeleteAccount} onSwitchUser={handleSwitchUser} onLogout={handleLogoutAdmin}
            />
          </PageBackground>
        )}

        {currentView === 'results' && (
          <PageBackground theme="results" customImageUrl={data.config.customBackgroundUrl} customTheme={data.config.backgroundTheme}>
            <ResultsDashboard config={data.config} status={status} positions={data.positions} candidates={data.candidates} ballots={data.ballots} voters={data.voters} auditLogs={data.auditLogs} isAdmin={isAdminAuthenticated} currentUser={currentUser} authenticatedVoter={voterResultsViewer}
              onExitVoterResults={() => { setVoterResultsViewer(null); setCurrentView('booth'); sounds.playSelect(); }}
              onPublishToggle={() => handleUpdateStatus(status === 'Results Published' ? 'Closed' : 'Results Published')} onLogout={handleLogoutAdmin}
            />
          </PageBackground>
        )}
      </main>

      {activeVoter && (
        <ReviewBallotModal isOpen={isReviewModalOpen} voter={activeVoter} positions={data.positions} candidates={data.candidates} choices={pendingChoices} isSubmitting={isSubmittingVote} onConfirmSubmit={handleConfirmSubmitVote} onBackToEdit={() => setIsReviewModalOpen(false)} config={data.config} />
      )}

      <AdminAuthModal isOpen={isAdminAuthModalOpen} expectedPin={data.config.adminPin} accounts={data.accounts || []} onSuccess={handleAdminAuthSuccess} onCancel={() => setIsAdminAuthModalOpen(false)} />

      <VoterResultsLoginModal isOpen={isVoterResultsModalOpen} onClose={() => setIsVoterResultsModalOpen(false)} config={data.config} status={status} roster={data.voters} onSuccess={(voter) => { setVoterResultsViewer(voter); setCurrentView('results'); }} />

      {currentView === 'results' && (
        <PrintableReport config={data.config} status={status} positions={data.positions} candidates={data.candidates} ballots={data.ballots} voters={data.voters} auditLogs={data.auditLogs} />
      )}
    </div>
  );
}
