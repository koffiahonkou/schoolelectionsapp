import React, { useState } from 'react';
import {
  AuditLogEntry,
  Ballot,
  Candidate,
  ElectionConfig,
  ElectionStatus,
  Position,
  Voter,
  UserAccount,
  getUserPermissions,
} from '../../types';
import { calculateElectionTallies } from '../../utils/normalization';
import { getCandidateColor, getCandidateInitials } from '../../utils/avatar';
import { downloadCSV } from '../../utils/storage';
import { ElectionProgressTracker } from './ElectionProgressTracker';
import {
  Trophy,
  AlertTriangle,
  Printer,
  Download,
  CheckCircle,
  BarChart3,
  ShieldCheck,
  Sparkles,
  Users,
  Eye,
  Tv,
  LogOut,
  UserCheck,
} from 'lucide-react';

interface ResultsDashboardProps {
  config: ElectionConfig;
  status: ElectionStatus;
  positions: Position[];
  candidates: Candidate[];
  ballots: Ballot[];
  voters: Voter[];
  auditLogs?: AuditLogEntry[];
  isAdmin: boolean;
  currentUser?: UserAccount | null;
  onPublishToggle?: () => void;
  authenticatedVoter?: Voter | null;
  onExitVoterResults?: () => void;
  onLogout?: () => void;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  config,
  status,
  positions,
  candidates,
  ballots,
  voters,
  auditLogs = [],
  isAdmin,
  currentUser,
  onPublishToggle,
  authenticatedVoter,
  onExitVoterResults,
  onLogout,
}) => {
  const [projectorMode, setProjectorMode] = useState(false);

  // Determine role-based staff permissions
  // Students must not see admin buttons (they should not be grayed out or shown)
  // Only authenticated staff accounts with the assigned role can use them
  const isStaffUser = Boolean(currentUser && !authenticatedVoter);
  const permissions = isStaffUser ? getUserPermissions(currentUser) : null;

  const canUseProjector = Boolean(isStaffUser && permissions?.canViewLiveTallies);
  const canExportReports = Boolean(isStaffUser && permissions?.canExportReports);
  const canPublishResults = Boolean(isStaffUser && permissions?.canChangePollStatus && onPublishToggle);

  // Compute tallies
  const report = calculateElectionTallies(positions, candidates, ballots, voters);

  const isPublished = status === 'Results Published';

  // Export Results to CSV
  const handleExportCSV = () => {
    let csv = `ELECTION RESULTS REPORT\n`;
    csv += `Election Title,${config.title}\n`;
    csv += `School,${config.schoolName}\n`;
    csv += `Date,${config.date}\n`;
    csv += `Registered Voters,${report.totalRegisteredVoters}\n`;
    csv += `Total Ballots Cast,${report.totalBallotsCast}\n`;
    csv += `Turnout Rate,${report.turnoutPercentage}%\n\n`;

    positions.forEach((pos) => {
      const tally = report.positionTallies[pos.id];
      if (!tally) return;

      csv += `\n--- POSITION: ${pos.title.toUpperCase()} ---\n`;
      csv += `Valid Votes,${tally.validVotes}\n`;
      csv += `Abstentions,${tally.abstainVotes}\n`;
      csv += `Total Ballots,${tally.totalVotes}\n`;

      if (tally.isTie) {
        csv += `Result,TIE between ${tally.tiedCandidates.map((c) => c.name).join(' and ')}\n`;
      } else if (tally.winners.length > 0) {
        csv += `Winner,${tally.winners[0].name}\n`;
      } else {
        csv += `Winner,No Votes Cast\n`;
      }

      csv += `Candidate,Votes,% Valid Votes,% Total Ballots\n`;
      tally.candidates.forEach((c) => {
        csv += `"${c.candidate.name}",${c.votes},${c.percentageOfValid}%,${c.percentageOfTotal}%\n`;
      });
      csv += `"Abstained / Blank",${tally.abstainVotes},N/A,${
        tally.totalVotes > 0
          ? ((tally.abstainVotes / tally.totalVotes) * 100).toFixed(1)
          : 0
      }%\n`;
    });

    downloadCSV(
      `election_certified_results_${new Date().toISOString().split('T')[0]}.csv`,
      csv
    );
  };

  return (
    <div
      id="results-dashboard"
      className={`min-h-[calc(100vh-5rem)] py-8 px-4 sm:px-6 lg:px-8 transition-colors print:hidden ${
        projectorMode ? 'bg-slate-950 text-white' : 'bg-slate-50/40 dark:bg-slate-950/65 backdrop-blur-[2px] text-slate-900 dark:text-slate-100'
      }`}
    >
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Authenticated Student Banner */}
        {authenticatedVoter && (
          <div
            id="authenticated-student-banner"
            className="p-4 sm:p-5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                {authenticatedVoter.fullName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-3xs font-black uppercase tracking-wider bg-indigo-200 dark:bg-indigo-900/80 text-indigo-900 dark:text-indigo-200 px-2 py-0.5 rounded-md">
                    Student Voter Portal
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-800 dark:text-indigo-300">
                    ID: {authenticatedVoter.voterId}
                  </span>
                  {authenticatedVoter.hasVoted ? (
                    <span className="text-3xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800">
                      Ballot Cast
                    </span>
                  ) : (
                    <span className="text-3xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      Eligible Student
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  Logged in as <strong>{authenticatedVoter.fullName}</strong> &bull; Official Certified Results
                </h3>
              </div>
            </div>

            {onExitVoterResults && (
              <button
                id="exit-voter-results-btn"
                type="button"
                onClick={onExitVoterResults}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Exit to Voting Booth</span>
              </button>
            )}
          </div>
        )}

        {/* Results Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                  isPublished
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                }`}
              >
                {isPublished ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Official Certified Results</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Draft Results (Polls Not Yet Published)</span>
                  </>
                )}
              </span>

              {projectorMode && (
                <span className="text-2xs font-extrabold uppercase tracking-wider bg-indigo-600 text-white px-2.5 py-0.5 rounded-full">
                  Projector Presentation Mode
                </span>
              )}
            </div>

            <h2
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                projectorMode ? 'text-white' : 'text-slate-900 dark:text-white'
              }`}
            >
              {config.title} &mdash; Election Results
            </h2>
            <p
              className={`text-xs sm:text-sm mt-0.5 ${
                projectorMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {config.schoolName} &bull; Certified Date: {config.date}
            </p>
          </div>

          {/* Action Buttons: strictly reserved for authorized staff accounts with assigned roles (never shown or grayed out for students) */}
          {(canUseProjector || canExportReports || canPublishResults) && (
            <div className="flex items-center gap-2 flex-wrap print:hidden">
              {/* Projector Mode Toggle - staff with canViewLiveTallies */}
              {canUseProjector && (
                <button
                  id="results-projector-btn"
                  type="button"
                  onClick={() => setProjectorMode(!projectorMode)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    projectorMode
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Tv className="w-4 h-4" />
                  <span>{projectorMode ? 'Exit Projector Mode' : 'Projector Display'}</span>
                </button>
              )}

              {/* CSV Export - staff with canExportReports */}
              {canExportReports && (
                <button
                  id="results-export-csv-btn"
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Export CSV</span>
                </button>
              )}

              {/* Printable Report - staff with canExportReports */}
              {canExportReports && (
                <button
                  id="results-print-certificate-btn"
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Official Certificate</span>
                </button>
              )}

              {/* Publish Toggle - staff with canChangePollStatus */}
              {canPublishResults && (
                <button
                  id="results-publish-toggle-btn"
                  type="button"
                  onClick={onPublishToggle}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer ${
                    isPublished
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isPublished ? 'Unpublish Results' : 'Publish to Students'}</span>
                </button>
              )}

              {/* Staff Logout Button */}
              {isStaffUser && onLogout && (
                <button
                  id="results-staff-logout-btn"
                  type="button"
                  onClick={onLogout}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title={`Log out of staff account (${currentUser?.fullName || 'Staff'})`}
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Logout Staff</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Visual Progress Tracker: Horizontal Timeline with Key Audit Timestamps */}
        <ElectionProgressTracker
          auditLogs={auditLogs}
          status={status}
          config={config}
          ballots={ballots}
          voters={voters}
          projectorMode={projectorMode}
        />

        {/* Turnout Participation Stats Card */}
        <div
          className={`p-6 sm:p-8 rounded-3xl border shadow-xs transition-colors ${
            projectorMode
              ? 'bg-slate-900 border-slate-800 text-white'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white'
          }`}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 flex items-center gap-2 mb-4">
            <Users className="w-4 h-4" />
            <span>Turnout & Participation Audit</span>
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <span className="text-2xs font-bold uppercase tracking-wider opacity-60 block">
                Total Registered
              </span>
              <span className="text-3xl sm:text-4xl font-black mt-1 block">
                {report.totalRegisteredVoters}
              </span>
              <span className="text-xs opacity-50 mt-0.5 block">Eligible Student Voters</span>
            </div>

            <div>
              <span className="text-2xs font-bold uppercase tracking-wider text-emerald-500 block">
                Total Ballots Cast
              </span>
              <span className="text-3xl sm:text-4xl font-black text-emerald-500 mt-1 block">
                {report.totalBallotsCast}
              </span>
              <span className="text-xs opacity-50 mt-0.5 block">Anonymous Submissions</span>
            </div>

            <div>
              <span className="text-2xs font-bold uppercase tracking-wider text-indigo-400 block">
                Voter Turnout Rate
              </span>
              <span className="text-3xl sm:text-4xl font-black text-indigo-400 mt-1 block">
                {report.turnoutPercentage}%
              </span>
              <span className="text-xs opacity-50 mt-0.5 block">Student Body Quorum</span>
            </div>

            <div>
              <span className="text-2xs font-bold uppercase tracking-wider opacity-60 block">
                Ballot Positions
              </span>
              <span className="text-3xl sm:text-4xl font-black mt-1 block">
                {positions.length}
              </span>
              <span className="text-xs opacity-50 mt-0.5 block">Elected Leadership Races</span>
            </div>
          </div>
        </div>

        {/* Breakdown for Each Position */}
        <div className="space-y-8">
          {positions.map((position, posIdx) => {
            const tally = report.positionTallies[position.id];
            if (!tally) return null;

            return (
              <div
                key={position.id}
                id={`results-position-${position.id}`}
                className={`p-6 sm:p-8 rounded-3xl border shadow-sm space-y-6 transition-colors ${
                  projectorMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Position Title & Winner Announcement */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-2xs font-extrabold uppercase tracking-wider text-indigo-500 bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 rounded-md inline-block mb-1.5">
                      Race #{posIdx + 1}
                    </span>
                    <h3
                      className={`text-xl sm:text-2xl font-black tracking-tight ${
                        projectorMode ? 'text-white' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {position.title}
                    </h3>
                    <p
                      className={`text-xs mt-0.5 ${
                        projectorMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {tally.validVotes} valid votes cast &bull; {tally.abstainVotes} abstentions (
                      {tally.totalVotes} total ballots)
                    </p>
                  </div>

                  {/* Winner / Tie Banner */}
                  {tally.validVotes === 0 ? (
                    <div className="px-4 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold">
                      No Votes Cast
                    </div>
                  ) : tally.isTie ? (
                    /* Critical Requirement 3: Explicit TIE handling */
                    <div
                      id={`tie-banner-${position.id}`}
                      className="px-5 py-3 rounded-2xl bg-amber-500/15 border-2 border-amber-500 text-amber-900 dark:text-amber-200 flex items-center gap-3 animate-in fade-in"
                    >
                      <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                      <div>
                        <span className="text-2xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 block">
                          Official Tie Declared
                        </span>
                        <div className="text-sm font-black">
                          {tally.tiedCandidates.map((c) => c.name).join(' & ')} ({tally.candidates[0].votes} votes each)
                        </div>
                      </div>
                    </div>
                  ) : tally.winners.length > 0 ? (
                    <div
                      id={`winner-banner-${position.id}`}
                      className="px-5 py-3 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500 text-emerald-950 dark:text-emerald-200 flex items-center gap-3 animate-in fade-in"
                    >
                      <Trophy className="w-6 h-6 text-emerald-500 shrink-0" />
                      <div>
                        <span className="text-2xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 block">
                          Elected Winner
                        </span>
                        <div className="text-sm font-black">
                          {tally.winners[0].name} ({tally.candidates[0].votes} votes &bull;{' '}
                          {tally.candidates[0].percentageOfValid}%)
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Candidates Bar Chart & Results Table */}
                <div className="space-y-4">
                  {tally.candidates.map(
                    ({ candidate, votes, percentageOfValid, percentageOfTotal }, candIdx) => {
                      const isWinner =
                        !tally.isTie && tally.winners.some((w) => w.id === candidate.id);
                      const isTiedWinner =
                        tally.isTie && tally.tiedCandidates.some((t) => t.id === candidate.id);
                      const color = getCandidateColor(candidate.name);

                      return (
                        <div
                          key={candidate.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            isWinner
                              ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20'
                              : isTiedWinner
                              ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20'
                              : projectorMode
                              ? 'border-slate-800 bg-slate-900/50'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-3">
                              {/* Rank */}
                              <span
                                className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center ${
                                  isWinner
                                    ? 'bg-emerald-600 text-white'
                                    : isTiedWinner
                                    ? 'bg-amber-500 text-slate-950'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {candIdx + 1}
                              </span>

                              {/* Photo / Initials */}
                              {candidate.photoUrl ? (
                                <img
                                  src={candidate.photoUrl}
                                  alt={candidate.name}
                                  className="w-10 h-10 rounded-xl object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                                />
                              ) : (
                                <div
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs border shrink-0 ${color.bg}`}
                                >
                                  {getCandidateInitials(candidate.name)}
                                </div>
                              )}

                              <div>
                                <div className="flex items-center gap-2">
                                  <h4
                                    className={`text-base font-bold ${
                                      projectorMode ? 'text-white' : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {candidate.name}
                                  </h4>
                                  {isWinner && (
                                    <span className="text-2xs font-extrabold uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                                      Winner
                                    </span>
                                  )}
                                  {isTiedWinner && (
                                    <span className="text-2xs font-extrabold uppercase bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full">
                                      Tie
                                    </span>
                                  )}
                                </div>
                                {candidate.slogan && (
                                  <p
                                    className={`text-xs italic ${
                                      projectorMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    &ldquo;{candidate.slogan}&rdquo;
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Vote Counts */}
                            <div className="flex items-center gap-3 self-end sm:self-auto text-right">
                              <div>
                                <span
                                  className={`text-base font-black font-mono ${
                                    projectorMode ? 'text-white' : 'text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {votes}
                                </span>
                                <span
                                  className={`text-xs ml-1 ${
                                    projectorMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {votes === 1 ? 'vote' : 'votes'}
                                </span>
                              </div>
                              <span
                                className={`text-sm font-black w-14 ${
                                  isWinner
                                    ? 'text-emerald-500'
                                    : isTiedWinner
                                    ? 'text-amber-500'
                                    : 'text-indigo-500'
                                }`}
                              >
                                {percentageOfValid}%
                              </span>
                            </div>
                          </div>

                          {/* Graphical Vote Bar */}
                          <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isWinner
                                  ? 'bg-emerald-500'
                                  : isTiedWinner
                                  ? 'bg-amber-500'
                                  : 'bg-indigo-600'
                              }`}
                              style={{ width: `${percentageOfValid}%` }}
                            />
                          </div>
                        </div>
                      );
                    }
                  )}

                  {/* Abstentions Breakdown (Critical Requirement 5) */}
                  <div
                    className={`p-3.5 rounded-2xl border border-dashed flex items-center justify-between gap-4 ${
                      projectorMode
                        ? 'border-slate-800 bg-slate-900/30 text-slate-400'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/30 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold block">
                        Abstained / Blank Ballots for this Position
                      </span>
                      <span className="text-2xs opacity-70">
                        Voters who elected to skip this race without selecting a candidate.
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold font-mono">
                        {tally.abstainVotes} {tally.abstainVotes === 1 ? 'vote' : 'votes'}
                      </span>
                      <span className="text-xs opacity-75 ml-2 font-semibold">
                        (
                        {tally.totalVotes > 0
                          ? ((tally.abstainVotes / tally.totalVotes) * 100).toFixed(1)
                          : 0}
                        % of ballots)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Official Certification Footer */}
        <div
          className={`p-6 rounded-3xl border text-center space-y-2 transition-colors ${
            projectorMode
              ? 'bg-slate-900 border-slate-800 text-slate-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-500">
            <ShieldCheck className="w-4 h-4" />
            <span>Certified Electoral Record</span>
          </div>
          <p className="text-xs max-w-xl mx-auto leading-relaxed">
            All ballots cast were validated using normalized student identity checks. Each eligible
            voter cast exactly one ballot, and choices were recorded under strictly confidential
            protocols.
          </p>
        </div>
      </div>
    </div>
  );
};
