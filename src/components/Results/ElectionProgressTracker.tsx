import React from 'react';
import { AuditLogEntry, ElectionConfig, ElectionStatus, Ballot, Voter } from '../../types';
import {
  Clock,
  PlayCircle,
  Inbox,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Hourglass,
  ShieldCheck,
  Calendar,
  Timer,
  Hash,
  ExternalLink,
} from 'lucide-react';

interface MilestoneData {
  id: 'started' | 'first_vote' | 'closed' | 'published';
  title: string;
  shortLabel: string;
  status: 'completed' | 'active' | 'pending';
  timestamp: string | null;
  formattedDate: string;
  formattedTime: string;
  relativeTime: string | null;
  summary: string;
  details: string;
  auditEntry?: AuditLogEntry;
}

interface ElectionProgressTrackerProps {
  auditLogs?: AuditLogEntry[];
  status: ElectionStatus;
  config: ElectionConfig;
  ballots?: Ballot[];
  voters?: Voter[];
  projectorMode?: boolean;
}

export const ElectionProgressTracker: React.FC<ElectionProgressTrackerProps> = ({
  auditLogs = [],
  status,
  config,
  ballots = [],
  voters = [],
  projectorMode = false,
}) => {
  // Helper: Format ISO timestamp
  const formatTimeParts = (iso: string | null | undefined) => {
    if (!iso) return { date: 'Pending', time: 'Not yet recorded', full: 'Pending' };
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return { date: 'Pending', time: 'Not yet recorded', full: 'Pending' };
      return {
        date: d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        time: d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
        full: d.toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }),
      };
    } catch {
      return { date: 'Pending', time: 'Not yet recorded', full: 'Pending' };
    }
  };

  // Helper: Calculate duration between two ISO strings
  const getDurationText = (startIso: string | null, endIso: string | null): string | null => {
    if (!startIso || !endIso) return null;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return null;

    const diffSec = Math.floor((end - start) / 1000);
    const hours = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;

    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // 1. Locate 'Election Started' in audit logs
  // Event: 'voting_opened'
  const startedLog = auditLogs.find((l) => l.eventType === 'voting_opened');
  const hasStarted =
    !!startedLog || status === 'Open' || status === 'Closed' || status === 'Results Published';

  // Fallback timestamp if log missing but election is running/completed
  const startedTimestamp =
    startedLog?.timestamp ||
    (hasStarted
      ? auditLogs.find((l) => l.eventType === 'settings_updated' || l.eventType === 'setup_unlocked')
          ?.timestamp || auditLogs[0]?.timestamp || null
      : null);

  const startedMilestone: MilestoneData = {
    id: 'started',
    title: 'Election Started',
    shortLabel: 'Polls Opened',
    status: hasStarted ? 'completed' : 'pending',
    timestamp: startedTimestamp,
    ...formatTimeParts(startedTimestamp),
    formattedDate: formatTimeParts(startedTimestamp).date,
    formattedTime: formatTimeParts(startedTimestamp).time,
    relativeTime: null,
    summary: hasStarted
      ? 'Voting stations officially opened by Electoral Commission'
      : 'Awaiting administrator to open voting stations',
    details:
      startedLog?.details ||
      (hasStarted
        ? 'Voting stations unlocked and accepting voter credentials.'
        : 'Polls are currently in setup mode.'),
    auditEntry: startedLog,
  };

  // 2. Locate 'First Vote Cast' in audit logs / ballots / voters
  // Event: earliest non-practice 'ballot_submitted'
  const firstVoteLog = auditLogs.find(
    (l) => l.eventType === 'ballot_submitted' && !l.details.toLowerCase().includes('practice')
  );

  // Cross-reference with real ballots
  const officialBallots = ballots
    .filter((b) => !b.isPractice && b.submittedAt)
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  // Cross-reference with voted voters
  const votedVoters = voters
    .filter((v) => v.hasVoted && v.votedAt)
    .sort((a, b) => new Date(a.votedAt!).getTime() - new Date(b.votedAt!).getTime());

  // Pick earliest real timestamp
  let firstVoteTimestamp: string | null = null;
  if (firstVoteLog?.timestamp) {
    firstVoteTimestamp = firstVoteLog.timestamp;
  } else if (officialBallots.length > 0) {
    firstVoteTimestamp = officialBallots[0].submittedAt;
  } else if (votedVoters.length > 0) {
    firstVoteTimestamp = votedVoters[0].votedAt!;
  }

  const hasFirstVote = !!firstVoteTimestamp;
  const isWaitingForFirstVote = hasStarted && !hasFirstVote && status === 'Open';

  let firstVoteStatus: 'completed' | 'active' | 'pending' = 'pending';
  if (hasFirstVote) {
    firstVoteStatus = 'completed';
  } else if (isWaitingForFirstVote) {
    firstVoteStatus = 'active';
  }

  const firstVoteDuration = getDurationText(startedTimestamp, firstVoteTimestamp);

  const firstVoteMilestone: MilestoneData = {
    id: 'first_vote',
    title: 'First Vote Cast',
    shortLabel: 'First Ballot',
    status: firstVoteStatus,
    timestamp: firstVoteTimestamp,
    ...formatTimeParts(firstVoteTimestamp),
    formattedDate: formatTimeParts(firstVoteTimestamp).date,
    formattedTime: formatTimeParts(firstVoteTimestamp).time,
    relativeTime: firstVoteDuration ? `+${firstVoteDuration} after open` : null,
    summary: hasFirstVote
      ? 'Initial authenticated voter deposited secret ballot'
      : isWaitingForFirstVote
      ? 'Polls open: Waiting for first student voter check-in'
      : 'Pending opening of voting stations',
    details:
      firstVoteLog?.details ||
      (hasFirstVote
        ? 'First official student ballot verified and cryptographically stored.'
        : 'Zero official ballots deposited thus far.'),
    auditEntry: firstVoteLog,
  };

  // 3. Locate 'Voting Closed' in audit logs
  // Event: 'voting_closed'
  const closedLog = auditLogs.find((l) => l.eventType === 'voting_closed');
  const isClosedOrPublished = status === 'Closed' || status === 'Results Published';
  const hasClosed = !!closedLog || isClosedOrPublished;

  let closedTimestamp: string | null = null;
  if (closedLog?.timestamp) {
    closedTimestamp = closedLog.timestamp;
  } else if (isClosedOrPublished) {
    // If closed but missing explicit log, take last audit log or current
    closedTimestamp = auditLogs[auditLogs.length - 1]?.timestamp || null;
  }

  let closedStatus: 'completed' | 'active' | 'pending' = 'pending';
  if (hasClosed) {
    closedStatus = 'completed';
  } else if (status === 'Open') {
    closedStatus = 'active';
  }

  const votingDuration = getDurationText(startedTimestamp, closedTimestamp);

  const closedMilestone: MilestoneData = {
    id: 'closed',
    title: 'Voting Closed',
    shortLabel: 'Polls Sealed',
    status: closedStatus,
    timestamp: closedTimestamp,
    ...formatTimeParts(closedTimestamp),
    formattedDate: formatTimeParts(closedTimestamp).date,
    formattedTime: formatTimeParts(closedTimestamp).time,
    relativeTime: votingDuration ? `Total polling: ${votingDuration}` : null,
    summary: hasClosed
      ? 'Voting concluded and ballot collection sealed'
      : status === 'Open'
      ? config.closingTime
        ? `Polls active: Scheduled close at ${config.closingTime}`
        : 'Polls actively receiving student ballots'
      : 'Scheduled upon completion of voting window',
    details:
      closedLog?.details ||
      (hasClosed
        ? 'Voting stations closed. Ballots sealed for cryptographic tallying.'
        : 'Polls remain open to all eligible students in the register.'),
    auditEntry: closedLog,
  };

  // 4. Locate 'Results Published' in audit logs
  // Event: 'results_published'
  const publishedLog = auditLogs.find((l) => l.eventType === 'results_published');
  const isResultsPublished = !!publishedLog || status === 'Results Published';

  let publishedTimestamp: string | null = null;
  if (publishedLog?.timestamp) {
    publishedTimestamp = publishedLog.timestamp;
  } else if (isResultsPublished) {
    publishedTimestamp = auditLogs[auditLogs.length - 1]?.timestamp || null;
  }

  let publishedStatus: 'completed' | 'active' | 'pending' = 'pending';
  if (isResultsPublished) {
    publishedStatus = 'completed';
  } else if (status === 'Closed') {
    publishedStatus = 'active';
  }

  const certDuration = getDurationText(closedTimestamp, publishedTimestamp);

  const publishedMilestone: MilestoneData = {
    id: 'published',
    title: 'Results Published',
    shortLabel: 'Certified',
    status: publishedStatus,
    timestamp: publishedTimestamp,
    ...formatTimeParts(publishedTimestamp),
    formattedDate: formatTimeParts(publishedTimestamp).date,
    formattedTime: formatTimeParts(publishedTimestamp).time,
    relativeTime: certDuration ? `+${certDuration} after close` : null,
    summary: isResultsPublished
      ? 'Official certified winners and turnout released publicly'
      : status === 'Closed'
      ? 'Ballots tabulated: Ready for official publication'
      : 'Pending conclusion of polling session',
    details:
      publishedLog?.details ||
      (isResultsPublished
        ? 'Official certified results published for public viewing.'
        : 'Results withheld until commissioner approval.'),
    auditEntry: publishedLog,
  };

  const milestones: MilestoneData[] = [
    startedMilestone,
    firstVoteMilestone,
    closedMilestone,
    publishedMilestone,
  ];

  // Helper for node icon
  const getMilestoneIcon = (id: MilestoneData['id'], milestoneStatus: MilestoneData['status']) => {
    switch (id) {
      case 'started':
        return <PlayCircle className="w-5 h-5" />;
      case 'first_vote':
        return <Inbox className="w-5 h-5" />;
      case 'closed':
        return <Lock className="w-5 h-5" />;
      case 'published':
        return <Sparkles className="w-5 h-5" />;
    }
  };

  return (
    <div
      id="election-progress-tracker"
      className={`rounded-3xl border shadow-xs transition-all overflow-hidden ${
        projectorMode
          ? 'bg-slate-900 border-slate-800 text-white'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white'
      }`}
    >
      {/* Header bar */}
      <div className="p-6 pb-4 sm:px-8 sm:pt-7 sm:pb-5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-4 h-4" />
            </span>
            <span className="text-2xs font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              Election Audit Progress &amp; Key Timestamps
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-black tracking-tight">
            Official Timeline &amp; Milestone Audit Trail
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cryptographically timestamped milestones extracted directly from the system audit log.
          </p>
        </div>

        {/* Audit Stats Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {votingDuration && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
              <Timer className="w-3.5 h-3.5 text-indigo-500" />
              <span>Voting Duration: {votingDuration}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{auditLogs.length} Logged Events</span>
          </div>
        </div>
      </div>

      {/* Main Horizontal Timeline Track */}
      <div className="p-6 sm:p-8">
        <div className="relative">
          {/* Connecting Track Line (Desktop horizontal line) */}
          <div className="hidden md:block absolute top-7 left-12 right-12 h-1 bg-slate-200 dark:bg-slate-800 z-0">
            {/* Dynamic filled portion */}
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-indigo-500 to-indigo-600 transition-all duration-500"
              style={{
                width:
                  publishedMilestone.status === 'completed'
                    ? '100%'
                    : closedMilestone.status === 'completed'
                    ? '75%'
                    : firstVoteMilestone.status === 'completed'
                    ? '50%'
                    : startedMilestone.status === 'completed'
                    ? '25%'
                    : '0%',
              }}
            />
          </div>

          {/* Timeline Nodes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4 relative z-10">
            {milestones.map((milestone, idx) => {
              const isCompleted = milestone.status === 'completed';
              const isActive = milestone.status === 'active';
              const isPending = milestone.status === 'pending';

              return (
                <div
                  key={milestone.id}
                  id={`milestone-node-${milestone.id}`}
                  className={`rounded-2xl p-4 sm:p-5 border transition-all relative ${
                    isCompleted
                      ? 'bg-white dark:bg-slate-850/80 border-slate-200 dark:border-slate-800 shadow-xs'
                      : isActive
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700/80 shadow-xs'
                      : 'bg-slate-50/60 dark:bg-slate-850/40 border-slate-200/70 dark:border-slate-800/60 opacity-80'
                  }`}
                >
                  {/* Top Node Indicator & Status Pill */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    {/* Node Circle */}
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all shadow-xs ${
                        isCompleted
                          ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                          : isActive
                          ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20 animate-pulse'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        getMilestoneIcon(milestone.id, milestone.status)
                      )}
                    </div>

                    {/* Step Number & Status Tag */}
                    <div className="text-right">
                      <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                        Stage 0{idx + 1}
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-3xs font-black uppercase tracking-wider mt-0.5 border ${
                          isCompleted
                            ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                            : isActive
                            ? 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {isCompleted ? 'Completed' : isActive ? 'Active Now' : 'Pending'}
                      </span>
                    </div>
                  </div>

                  {/* Milestone Title */}
                  <h4 className="text-sm sm:text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>{milestone.title}</span>
                  </h4>

                  {/* Primary Timestamp Display */}
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    {isCompleted && milestone.timestamp ? (
                      <div>
                        <div className="text-sm font-black font-mono tracking-tight text-slate-900 dark:text-white">
                          {milestone.formattedTime}
                        </div>
                        <div className="flex items-center gap-1.5 text-2xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{milestone.formattedDate}</span>
                        </div>
                      </div>
                    ) : isActive ? (
                      <div className="space-y-1">
                        <div className="text-xs font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-ping" />
                          <span>In Progress</span>
                        </div>
                        <p className="text-2xs font-medium text-slate-500 dark:text-slate-400">
                          {milestone.summary}
                        </p>
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 italic">
                        Awaiting trigger
                      </div>
                    )}
                  </div>

                  {/* Relative Duration / Sequence Offset */}
                  {milestone.relativeTime && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-3xs font-bold font-mono">
                      <Timer className="w-2.5 h-2.5 text-indigo-500" />
                      <span>{milestone.relativeTime}</span>
                    </div>
                  )}

                  {/* Brief summary description */}
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                    {milestone.summary}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
