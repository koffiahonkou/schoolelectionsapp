import React, { useState, useEffect } from 'react';
import {
  Ballot,
  Candidate,
  ElectionConfig,
  ElectionStatus,
  Position,
  Voter,
} from '../../types';
import { calculateElectionTallies } from '../../utils/normalization';
import { getCandidateColor, getCandidateInitials } from '../../utils/avatar';
import {
  Users,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Flame,
  AlertCircle,
  HelpCircle,
  BarChart2,
} from 'lucide-react';

interface LiveTurnoutViewProps {
  config: ElectionConfig;
  status: ElectionStatus;
  positions: Position[];
  candidates: Candidate[];
  ballots: Ballot[];
  voters: Voter[];
}

export const LiveTurnoutView: React.FC<LiveTurnoutViewProps> = ({
  config,
  status,
  positions,
  candidates,
  ballots,
  voters,
}) => {
  const [adminOverrideReveal, setAdminOverrideReveal] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string | null>(null);

  // Compute tallies
  const report = calculateElectionTallies(positions, candidates, ballots, voters);

  // Countdown timer calculation if closingTime is set
  useEffect(() => {
    if (!config.closingTime || status !== 'Open') {
      setTimeLeftStr(null);
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      const [hours, minutes] = config.closingTime!.split(':').map(Number);
      const closeTarget = new Date();
      closeTarget.setHours(hours, minutes, 0, 0);

      const diffMs = closeTarget.getTime() - now.getTime();
      if (diffMs <= 0) {
        setTimeLeftStr('Voting time has expired');
        return;
      }

      const h = Math.floor(diffMs / (1000 * 60 * 60));
      const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diffMs % (1000 * 60)) / 1000);

      const pad = (n: number) => (n < 10 ? '0' + n : n);
      setTimeLeftStr(`${pad(h)}:${pad(m)}:${pad(s)}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [config.closingTime, status]);

  const shouldHideTallies =
    config.hideTalliesDuringVoting &&
    status === 'Open' &&
    !adminOverrideReveal;

  return (
    <div className="space-y-6">
      {/* Turnout Headline & Countdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <span>Live Turnout & Participation Monitor</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Streaming voter participation counts updating in real time.
          </p>
        </div>

        {timeLeftStr && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 rounded-2xl shadow-2xs">
            <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
            <div className="text-xs">
              <span className="font-bold uppercase tracking-wider block text-2xs text-amber-700">
                Polls Closing In
              </span>
              <span className="font-mono font-black text-sm">{timeLeftStr}</span>
            </div>
          </div>
        )}
      </div>

      {/* Large Turnout Progress Bar Card */}
      <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Voter Turnout Rate
            </span>
            <div className="text-3xl sm:text-4xl font-black text-slate-900 mt-1">
              {report.turnoutPercentage}%
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500">
              <strong>{report.totalBallotsCast}</strong> of <strong>{report.totalRegisteredVoters}</strong> registered students
            </span>
            <div className="text-xs text-slate-400 mt-0.5">
              {report.totalRegisteredVoters - report.totalBallotsCast} voters remaining
            </div>
          </div>
        </div>

        {/* Bar */}
        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
          <div
            className="h-full bg-linear-to-r from-indigo-500 via-amber-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, report.turnoutPercentage))}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-2xs text-slate-400 font-bold uppercase tracking-wider">
          <span>0%</span>
          <span>50% Quorum</span>
          <span>100% Full Turnout</span>
        </div>
      </div>

      {/* Tallies Visibility Toggle for Admin */}
      {config.hideTalliesDuringVoting && status === 'Open' && (
        <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {shouldHideTallies ? (
              <EyeOff className="w-5 h-5 text-slate-500 shrink-0" />
            ) : (
              <Eye className="w-5 h-5 text-indigo-600 shrink-0" />
            )}
            <div className="text-xs text-slate-700">
              <strong>Electoral Policy: </strong>
              {shouldHideTallies
                ? 'Candidate tallies are hidden during active voting to ensure unbiased voting.'
                : 'Administrator override active: viewing live candidate tallies.'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAdminOverrideReveal(!adminOverrideReveal)}
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-2xs self-start sm:self-auto cursor-pointer"
          >
            {shouldHideTallies ? (
              <>
                <Eye className="w-3.5 h-3.5 text-slate-600" />
                <span>Reveal Tallies (Admin Only)</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                <span>Re-hide Tallies</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Per-Position Tallies */}
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-600" />
          <span>Live Breakdown by Ballot Position</span>
        </h4>

        {positions.map((pos) => {
          const tally = report.positionTallies[pos.id];
          if (!tally) return null;

          return (
            <div
              key={pos.id}
              className="p-5 sm:p-6 bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h5 className="text-base font-bold text-slate-900">{pos.title}</h5>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Total votes cast in this race: <strong>{tally.totalVotes}</strong> (
                    <strong>{tally.validVotes}</strong> valid candidates &bull;{' '}
                    <strong>{tally.abstainVotes}</strong> abstentions)
                  </p>
                </div>
              </div>

              {shouldHideTallies ? (
                <div className="py-8 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
                  <EyeOff className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">
                    Candidate tallies will be revealed once polls close and results are certified.
                  </p>
                  <p className="text-2xs text-slate-400">
                    {tally.totalVotes} ballots recorded for {pos.title} so far.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {tally.candidates.map(({ candidate, votes, percentageOfValid }) => {
                    const color = getCandidateColor(candidate.name);

                    return (
                      <div key={candidate.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-2xs border ${color.bg}`}
                            >
                              {getCandidateInitials(candidate.name)}
                            </div>
                            <span className="font-bold text-slate-900 truncate">
                              {candidate.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-slate-800">
                              {votes} {votes === 1 ? 'vote' : 'votes'}
                            </span>
                            <span className="font-bold text-indigo-600 w-12 text-right">
                              {percentageOfValid}%
                            </span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                            style={{ width: `${percentageOfValid}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Abstentions bar */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium italic">Abstained / Skipped</span>
                      <span className="font-mono font-semibold">
                        {tally.abstainVotes} {tally.abstainVotes === 1 ? 'vote' : 'votes'}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-400 rounded-full transition-all duration-300"
                        style={{
                          width: `${
                            tally.totalVotes > 0
                              ? ((tally.abstainVotes / tally.totalVotes) * 100).toFixed(1)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
