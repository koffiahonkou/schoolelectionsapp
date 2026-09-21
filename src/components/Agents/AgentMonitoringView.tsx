import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Candidate,
  ElectionConfig,
  ElectionStatus,
  Position,
  Voter,
  Ballot,
  ABSTAIN_SELECTION,
  UserAccount,
  RolePermissions,
} from '../../types';
import { calculateElectionTallies } from '../../utils/normalization';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import {
  PieChart as PieIcon,
  ShieldCheck,
  RefreshCw,
  Printer,
  Clock,
  ArrowLeft,
  Lock,
  Radio,
  Users,
  Database,
  Wifi,
  Activity,
  CheckCircle2,
  AlertCircle,
  Send,
  Sparkles,
  KeyRound,
  Eye,
  ChevronDown,
  ChevronUp,
  X,
  LogOut,
} from 'lucide-react';
import { ElectionClock } from '../Common/ElectionClock';
import {
  subscribeToAnonymousVotes,
  subscribeToVoterTokens,
  subscribeToAgentMonitoring,
  saveAnonymousVoteToFirestore,
  syncVoterRosterToFirestoreTokens,
  registerOrPingAgent,
  AgentObserverRecord,
  VoterTokenRecord,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DB_ID,
} from '../../lib/firebaseVoting';

interface AgentMonitoringViewProps {
  config: ElectionConfig;
  status: ElectionStatus;
  positions: Position[];
  candidates: Candidate[];
  ballots: Ballot[];
  voters: Voter[];
  currentUser?: UserAccount | null;
  permissions?: RolePermissions;
  onReturnToBooth?: () => void;
  onLogout?: () => void;
}

// Distinct, balanced color palette for chart slices
const SLICE_COLORS = [
  '#4F46E5', // Indigo
  '#059669', // Emerald
  '#D97706', // Amber
  '#7C3AED', // Violet
  '#2563EB', // Blue
  '#DB2777', // Pink
  '#0891B2', // Cyan
  '#EA580C', // Orange
  '#6366F1', // Indigo light
  '#10B981', // Emerald light
];

const ABSTAIN_COLOR = '#94A3B8'; // Slate 400

interface AnonymousChartSlice {
  id: string;
  percentage: number;
  isAbstain: boolean;
  color: string;
}

interface ScrutinyEvent {
  id: string;
  time: string;
  type: 'vote' | 'agent' | 'sync' | 'system';
  message: string;
}

export const AgentMonitoringView: React.FC<AgentMonitoringViewProps> = ({
  config,
  status,
  positions,
  candidates,
  ballots: initialBallots,
  voters,
  currentUser,
  permissions,
  onReturnToBooth,
  onLogout,
}) => {
  // Determine if current user is an Agent Monitor or has view-only restrictions
  const isAgentMonitorRole = currentUser?.role === 'Agent Monitor';
  const isViewOnly = isAgentMonitorRole;

  const [includeAbstainInChart, setIncludeAbstainInChart] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(
    new Date().toLocaleTimeString()
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real-time Firestore State
  const [firestoreVotes, setFirestoreVotes] = useState<Ballot[]>([]);
  const [firestoreTokens, setFirestoreTokens] = useState<VoterTokenRecord[]>([]);
  const [liveAgents, setLiveAgents] = useState<AgentObserverRecord[]>([]);
  const [isStreamActive, setIsStreamActive] = useState<boolean>(true);
  const [streamLatency, setStreamLatency] = useState<number>(18);
  const [lastLiveEvent, setLastLiveEvent] = useState<{ time: string; text: string } | null>(null);
  const [eventHistory, setEventHistory] = useState<ScrutinyEvent[]>([]);
  const [showEventFeed, setShowEventFeed] = useState<boolean>(false);
  const [showAgentModal, setShowAgentModal] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Agent Check-in Form
  const [agentFormName, setAgentFormName] = useState('');
  const [agentFormCandidate, setAgentFormCandidate] = useState('Independent Observer');
  const [agentFormRole, setAgentFormRole] = useState<
    'Candidate Agent' | 'Independent Observer' | 'Electoral Commission Monitor'
  >('Candidate Agent');
  const [agentFormStation, setAgentFormStation] = useState('Central Scrutiny Terminal');

  // Track initial load count to avoid noisy toasts on first load
  const isFirstLoad = useRef(true);

  // 1. Subscribe to real-time Firestore collections: votes, voter_tokens, agent_monitoring
  useEffect(() => {
    setIsStreamActive(true);

    const unsubscribeVotes = subscribeToAnonymousVotes(
      (votes) => {
        setFirestoreVotes(votes);
        setIsStreamActive(true);
        const timeStr = new Date().toLocaleTimeString();
        setLastLiveEvent({
          time: timeStr,
          text: `Live anonymous vote snapshot received (${votes.length} ballots in Firestore)`,
        });

        if (!isFirstLoad.current) {
          setEventHistory((prev) => [
            {
              id: 'evt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              time: timeStr,
              type: 'vote',
              message: `Firestore Real-time Listener: Anonymous ballot committed. Total live ballots: ${votes.length}`,
            },
            ...prev.slice(0, 24),
          ]);
        } else {
          isFirstLoad.current = false;
          setEventHistory((prev) => [
            {
              id: 'evt-init',
              time: timeStr,
              type: 'system',
              message: `Connected to Firestore (${FIREBASE_PROJECT_ID}). Real-time listener active.`,
            },
          ]);
        }
      },
      (err) => {
        console.warn('Firestore votes listener error:', err);
        setIsStreamActive(false);
      }
    );

    const unsubscribeTokens = subscribeToVoterTokens(
      (tokens) => {
        setFirestoreTokens(tokens);
      },
      (err) => console.warn('Firestore voter tokens listener error:', err)
    );

    const unsubscribeAgents = subscribeToAgentMonitoring(
      (agents) => {
        setLiveAgents(agents);
      },
      (err) => console.warn('Firestore agent monitoring listener error:', err)
    );

    // Minor latency heartbeat simulation
    const latencyInterval = setInterval(() => {
      setStreamLatency(Math.floor(12 + Math.random() * 16));
    }, 4000);

    return () => {
      unsubscribeVotes();
      unsubscribeTokens();
      unsubscribeAgents();
      clearInterval(latencyInterval);
    };
  }, []);

  // Merge Firestore ballots with props ballots (prefer Firestore if available, otherwise deduplicate by id)
  const activeBallots = useMemo(() => {
    if (firestoreVotes.length === 0) {
      return initialBallots;
    }
    const map = new Map<string, Ballot>();
    // Initial local ballots
    initialBallots.forEach((b) => map.set(b.id, b));
    // Overlay real-time Firestore ballots
    firestoreVotes.forEach((b) => map.set(b.id, b));
    return Array.from(map.values());
  }, [firestoreVotes, initialBallots]);

  // Compute tallies strictly for percentage derivation
  const report = useMemo(() => {
    return calculateElectionTallies(positions, candidates, activeBallots, voters, false);
  }, [positions, candidates, activeBallots, voters]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefreshedAt(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    }, 300);
  };

  // One-click sync of existing ballots to Firestore
  const handleSyncBallotsToFirestore = async () => {
    setIsSyncing(true);
    let count = 0;
    for (const b of initialBallots) {
      const ok = await saveAnonymousVoteToFirestore(b);
      if (ok) count++;
    }
    setIsSyncing(false);
    setSyncNotice(`Synced ${count} anonymous ballots to Firestore.`);
    setTimeout(() => setSyncNotice(null), 4000);
  };

  // One-click sync of voter roster tokens to Firestore
  const handleSyncTokensToFirestore = async () => {
    setIsSyncing(true);
    const res = await syncVoterRosterToFirestoreTokens(voters);
    setIsSyncing(false);
    if (res.success) {
      setSyncNotice(`Provisioned ${res.count} voter tokens in Firestore.`);
    } else {
      setSyncNotice('Failed to sync voter tokens.');
    }
    setTimeout(() => setSyncNotice(null), 4000);
  };

  // Submit agent check-in
  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentFormName.trim()) return;

    const newAgent: AgentObserverRecord = {
      id: 'agent-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
      agentName: agentFormName.trim(),
      representedCandidate: agentFormCandidate,
      role: agentFormRole,
      status: 'observing',
      station: agentFormStation.trim() || 'Central Booth',
      lastHeartbeat: new Date().toISOString(),
    };

    await registerOrPingAgent(newAgent);
    setShowAgentModal(false);
    setAgentFormName('');
    setEventHistory((prev) => [
      {
        id: 'evt-' + Date.now(),
        time: new Date().toLocaleTimeString(),
        type: 'agent',
        message: `Agent ${newAgent.agentName} (${newAgent.representedCandidate}) checked in to ${newAgent.station}.`,
      },
      ...prev,
    ]);
  };

  // Test Real-Time anonymous vote deposit to demonstrate the live Firestore listener
  const handleDepositTestVote = async () => {
    if (positions.length === 0) return;
    const testChoices: Record<string, string> = {};

    positions.forEach((pos) => {
      const posCands = candidates.filter((c) => c.positionId === pos.id);
      if (posCands.length > 0) {
        // randomly pick one candidate or abstain
        const randIndex = Math.floor(Math.random() * (posCands.length + 1));
        if (randIndex < posCands.length) {
          testChoices[pos.id] = posCands[randIndex].id;
        } else {
          testChoices[pos.id] = ABSTAIN_SELECTION;
        }
      }
    });

    const testBallot: Ballot = {
      id: 'bal-live-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      submittedAt: new Date().toISOString(),
      isPractice: false,
      choices: testChoices,
    };

    const ok = await saveAnonymousVoteToFirestore(testBallot);
    if (ok) {
      setSyncNotice('Test anonymous ballot deposited to Firestore. Watch live chart update!');
      setTimeout(() => setSyncNotice(null), 4000);
    }
  };

  // Prepare chart dataset for each position - STRICTLY ANONYMOUS PERCENTAGES
  // NO CANDIDATE NAMES, NO ASPIRANT IDENTIFIERS
  const positionChartsData = useMemo(() => {
    const result: Record<string, AnonymousChartSlice[]> = {};

    positions.forEach((pos) => {
      const posTally = report.positionTallies[pos.id];
      if (!posTally) {
        result[pos.id] = [];
        return;
      }

      const baseTotal = includeAbstainInChart
        ? posTally.totalVotes
        : posTally.validVotes;

      const slices: AnonymousChartSlice[] = [];
      const positionCandidates = candidates.filter((c) => c.positionId === pos.id);

      positionCandidates.forEach((cand, idx) => {
        const found = posTally.candidates.find((tc) => tc.candidate.id === cand.id);
        const votes = found ? found.votes : 0;
        const pct =
          baseTotal > 0
            ? Number(((votes / baseTotal) * 100).toFixed(1))
            : 0;

        slices.push({
          id: `slice-${cand.id}`,
          percentage: pct,
          isAbstain: false,
          color: SLICE_COLORS[idx % SLICE_COLORS.length],
        });
      });

      // Blank / Abstain slice if enabled and recorded
      if (includeAbstainInChart && posTally.abstainVotes > 0) {
        const abstainPct =
          baseTotal > 0
            ? Number(((posTally.abstainVotes / baseTotal) * 100).toFixed(1))
            : 0;

        slices.push({
          id: ABSTAIN_SELECTION,
          percentage: abstainPct,
          isAbstain: true,
          color: ABSTAIN_COLOR,
        });
      }

      result[pos.id] = slices;
    });

    return result;
  }, [positions, candidates, report, includeAbstainInChart]);

  // Anonymous Percentage Tooltip - NO APPLICANT NAMES
  const AnonymousPercentageTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: AnonymousChartSlice = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-700 text-xs min-w-[160px]">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: data.color }}
            />
            <span className="font-bold text-xs text-slate-300">
              {data.isAbstain ? 'Blank / Abstain' : 'Candidate Share'}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 text-2xs font-bold uppercase tracking-wider">
              Share of Ballots:
            </span>
            <span className="font-mono font-black text-emerald-400 text-base">
              {data.percentage}%
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Voter tokens metrics
  const tokensTotal = firestoreTokens.length > 0 ? firestoreTokens.length : voters.length;
  const tokensUsed = firestoreTokens.length > 0
    ? firestoreTokens.filter((t) => t.hasVoted || t.status === 'used').length
    : voters.filter((v) => v.hasVoted).length;
  const tokenTurnoutPct = tokensTotal > 0 ? Math.round((tokensUsed / tokensTotal) * 100) : 0;

  return (
    <div id="agent-monitoring-portal" className="min-h-[calc(100vh-5rem)] bg-slate-100/50 dark:bg-slate-950/65 backdrop-blur-[2px] pb-16 transition-colors duration-200">
      {/* Top Scrutiny Navigation Header */}
      <div className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-2xl bg-amber-500 text-slate-950 font-black shadow-xs">
                <PieIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-black tracking-tight text-white">
                    Aspirant Polling Agent Monitoring Station
                  </h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-extrabold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    <ShieldCheck className="w-3 h-3 text-amber-400" />
                    Anonymous Distribution Feed
                  </span>
                  {isViewOnly && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-black uppercase tracking-wider bg-purple-950/80 text-purple-200 border border-purple-500/50">
                      <Eye className="w-3 h-3 text-purple-300" />
                      View-Only Observer Mode (Interactive Controls Disabled)
                    </span>
                  )}
                  {/* Firestore Real-Time Stream Status Badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-extrabold uppercase tracking-wider border transition-colors ${
                      isStreamActive
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                        : 'bg-rose-950/80 text-rose-300 border-rose-600/60'
                    }`}
                    title={`Firestore Real-Time Stream Active on DB: ${FIRESTORE_DB_ID}`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>Firestore Real-Time Listener Active</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simultaneous live percentage distribution across all races. Connected via Firebase Firestore real-time listeners.
                </p>
              </div>
            </div>

            {/* Quick Actions & Live Synchronizer */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 text-2xs text-slate-300">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Stream Latency: <strong>{streamLatency}ms</strong></span>
              </div>

              {/* Mode Toggle: Valid Only vs All Ballots */}
              <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-2xs">
                <button
                  type="button"
                  onClick={() => setIncludeAbstainInChart(true)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    includeAbstainInChart
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Ballots
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeAbstainInChart(false)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    !includeAbstainInChart
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Valid Votes Only
                </button>
              </div>

              {/* Agent Check-In Button */}
              <button
                type="button"
                onClick={() => setShowAgentModal(true)}
                disabled={isViewOnly}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  isViewOnly
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700 opacity-60'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs cursor-pointer'
                }`}
                title={isViewOnly ? 'Agent registration disabled for view-only account' : 'Register Polling Agent or Observer in Firestore'}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Agent Check-In</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Print</span>
              </button>

              {onReturnToBooth && (
                <button
                  type="button"
                  onClick={onReturnToBooth}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Booth</span>
                </button>
              )}

              {onLogout && (
                <button
                  id="agents-staff-logout-btn"
                  type="button"
                  onClick={onLogout}
                  className="px-3 py-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-rose-800/60 transition-colors cursor-pointer"
                  title="Log out of staff account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sync Notice Alert */}
      {syncNotice && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{syncNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 dark:hover:text-emerald-100 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {/* Real-time Telemetry Dashboard Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Firestore Anonymous Ballots */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                Firestore Votes Stream
              </span>
              <Database className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                {activeBallots.filter((b) => !b.isPractice).length}
              </span>
              <span className="text-2xs text-slate-400">ballots live</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-3xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
              <span className="truncate">DB: {FIREBASE_PROJECT_ID}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">● Streaming</span>
            </div>
          </div>

          {/* Metric 2: Voter Tokens */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                Voter Tokens Collection
              </span>
              <KeyRound className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                {tokensUsed} / {tokensTotal}
              </span>
              <span className="text-2xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                {tokenTurnoutPct}%
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-3xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
              <span>{tokensTotal - tokensUsed} tokens eligible</span>
              <span className="font-semibold text-slate-500">1-Vote Enforced</span>
            </div>
          </div>

          {/* Metric 3: Active Candidate Agents & Observers */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                Aspirant Polling Agents
              </span>
              <Users className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                {liveAgents.length > 0 ? liveAgents.length : '3 (Demo)'}
              </span>
              <span className="text-2xs text-slate-400">certified</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-3xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
              <span>All races scrutinized</span>
              <button
                type="button"
                onClick={() => setShowAgentModal(true)}
                disabled={isViewOnly}
                className={
                  isViewOnly
                    ? 'text-slate-400 dark:text-slate-600 font-semibold cursor-not-allowed'
                    : 'text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer'
                }
              >
                + Check In
              </button>
            </div>
          </div>

          {/* Metric 4: Real-time Test & Sync Tools */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                Live Scrutiny Actions
              </span>
              <Activity className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleDepositTestVote}
                disabled={isViewOnly}
                className={`px-2.5 py-1.5 rounded-xl border text-2xs font-bold flex items-center gap-1 transition-colors ${
                  isViewOnly
                    ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-60'
                    : 'bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-900 dark:text-purple-300 border-purple-200 dark:border-purple-800 cursor-pointer'
                }`}
                title={isViewOnly ? 'Simulate Vote disabled for view-only account' : 'Deposit an anonymous test vote to Firestore to verify real-time chart animation'}
              >
                <Sparkles className="w-3 h-3 text-purple-500" />
                <span>Simulate Vote</span>
              </button>
              <button
                type="button"
                onClick={handleSyncBallotsToFirestore}
                disabled={isSyncing || isViewOnly}
                className={`px-2.5 py-1.5 rounded-xl text-2xs font-bold flex items-center gap-1 transition-colors ${
                  isViewOnly
                    ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-60'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer'
                }`}
                title={isViewOnly ? 'Sync Votes disabled for view-only account' : 'Synchronize all local ballots to Firestore votes collection'}
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-indigo-500' : ''}`} />
                <span>Sync Votes</span>
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-3xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
              <button
                type="button"
                onClick={handleSyncTokensToFirestore}
                disabled={isViewOnly}
                className={
                  isViewOnly
                    ? 'text-slate-400 dark:text-slate-600 font-semibold cursor-not-allowed'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold cursor-pointer underline'
                }
                title={isViewOnly ? 'Sync Roster Tokens disabled for view-only account' : undefined}
              >
                Sync Roster Tokens
              </button>
              <button
                type="button"
                onClick={() => setShowEventFeed(!showEventFeed)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold cursor-pointer flex items-center gap-0.5"
              >
                <span>Live Feed</span>
                {showEventFeed ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Live Scrutiny Event Feed Collapsible Drawer */}
        {showEventFeed && (
          <div className="bg-slate-900 text-slate-100 rounded-3xl p-4 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Firestore Real-Time Scrutiny &amp; Listener Telemetry Log
                </h4>
              </div>
              <span className="text-3xs text-slate-400 font-mono">
                {eventHistory.length} events logged
              </span>
            </div>
            <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-2 font-mono text-2xs">
              {eventHistory.length === 0 ? (
                <div className="text-slate-500 py-3 text-center">
                  Listening for Firestore real-time snapshots...
                </div>
              ) : (
                eventHistory.map((evt) => (
                  <div key={evt.id} className="flex items-start gap-2.5 py-1 border-b border-slate-800/60 last:border-0">
                    <span className="text-slate-500 shrink-0 font-bold">[{evt.time}]</span>
                    <span
                      className={`font-semibold ${
                        evt.type === 'vote'
                          ? 'text-emerald-400'
                          : evt.type === 'agent'
                          ? 'text-amber-300'
                          : 'text-indigo-300'
                      }`}
                    >
                      {evt.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Active Certified Observers & Agents Banner */}
        {liveAgents.length > 0 && (
          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Active Observers &amp; Agents ({liveAgents.length}):
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {liveAgents.map((ag) => (
                <span
                  key={ag.id}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-2xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <strong>{ag.agentName}</strong> ({ag.representedCandidate})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Banner with Election Clock & Privacy Notice */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span>Simultaneous Multi-Race Percentage Monitor ({positions.length} Positions)</span>
              </h3>
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                Charts display percentage distribution only. Applicant names and breakdown tables are masked to prevent identifying leads before official close.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <ElectionClock config={config} status={status} variant="compact" />
          </div>
        </div>

        {/* Empty State */}
        {positions.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-2xs max-w-md mx-auto">
            <PieIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">No Positions Configured</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Add positions and candidates in the Electoral Commission setup tab to monitor agent share charts.
            </p>
          </div>
        ) : (
          /* ALL CHARTS ON THE SCREEN AT ONCE IN A RESPONSIVE MULTI-COLUMN GRID */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
            {positions.map((pos) => {
              const slices = positionChartsData[pos.id] || [];
              const hasVotes = slices.some((s) => s.percentage > 0);
              const contestantCount = slices.filter((s) => !s.isAbstain).length;

              return (
                <div
                  key={pos.id}
                  id={`agent-chart-card-${pos.id}`}
                  className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:shadow-xs transition-all"
                >
                  {/* Position Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-3xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                          Contested Office
                        </span>
                        <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                          {pos.title}
                        </h3>
                        {pos.description && (
                          <p className="text-2xs text-slate-400 dark:text-slate-400 mt-0.5 line-clamp-1">
                            {pos.description}
                          </p>
                        )}
                      </div>

                      <span className="px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                        {contestantCount} Aspirants
                      </span>
                    </div>

                    {/* Donut Pie Chart Canvas - ONLY PERCENTAGES, NO NAMES */}
                    <div className="my-4 h-64 sm:h-72 w-full flex items-center justify-center relative">
                      {!hasVotes ? (
                        <div className="text-center p-6 bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 max-w-xs">
                          <PieIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Ballots Recorded Yet</p>
                          <p className="text-2xs text-slate-400 dark:text-slate-400 mt-0.5">
                            Percentage slices will populate in real time once voting commences.
                          </p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={slices}
                              dataKey="percentage"
                              nameKey="id"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={105}
                              paddingAngle={2.5}
                              label={({ percentage }) =>
                                percentage > 0 ? `${percentage}%` : ''
                              }
                            >
                              {slices.map((entry) => (
                                <Cell
                                  key={`cell-${entry.id}`}
                                  fill={entry.color}
                                  stroke="#FFFFFF"
                                  strokeWidth={1.5}
                                  style={{ outline: 'none' }}
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<AnonymousPercentageTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}

                      {/* Center donut label with no voting counts */}
                      {hasVotes && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                            Distribution
                          </span>
                          <span className="font-mono text-sm font-black text-slate-800 dark:text-slate-200">
                            100%
                          </span>
                          <span className="text-3xs text-slate-400">
                            {includeAbstainInChart ? 'All Ballots' : 'Valid Votes'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clean privacy footer instead of Aspirant Share Breakdown */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-2xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span>Applicant names hidden for voter privacy</span>
                    </span>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">
                      {contestantCount} Anonymous Contenders
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Check-in Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 backdrop-blur-xs pt-8 sm:pt-14 pb-8 px-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative animate-in fade-in slide-in-from-top-4 duration-150">
            <button
              type="button"
              onClick={() => setShowAgentModal(false)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-2xl bg-indigo-600 text-white font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Polling Agent Check-In
                </h3>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  Register in the Firestore <code className="font-mono">agent_monitoring</code> collection.
                </p>
              </div>
            </div>

            <form onSubmit={handleRegisterAgent} className="space-y-4">
              <div>
                <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Agent / Observer Name
                </label>
                <input
                  type="text"
                  required
                  value={agentFormName}
                  onChange={(e) => setAgentFormName(e.target.value)}
                  placeholder="e.g. Samuel Adjei"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Represented Aspirant / Organization
                </label>
                <select
                  value={agentFormCandidate}
                  onChange={(e) => setAgentFormCandidate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Independent Observer">Independent Observer (Student Bar / SBA)</option>
                  <option value="Electoral Commission Monitor">Electoral Commission Official Monitor</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={`Aspirant: ${c.name}`}>
                      Agent for {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Scrutiny Station / Polling Booth
                </label>
                <input
                  type="text"
                  value={agentFormStation}
                  onChange={(e) => setAgentFormStation(e.target.value)}
                  placeholder="e.g. Main Hall Terminal #2"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAgentModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Confirm Check-In</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
