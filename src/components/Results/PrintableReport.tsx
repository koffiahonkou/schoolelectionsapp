import React from 'react';
import {
  AuditLogEntry,
  Ballot,
  Candidate,
  ElectionConfig,
  ElectionStatus,
  Position,
  Voter,
} from '../../types';
import { calculateElectionTallies } from '../../utils/normalization';
import { SchoolLogo } from '../Common/SchoolLogo';

interface PrintableReportProps {
  config: ElectionConfig;
  status: ElectionStatus;
  positions: Position[];
  candidates: Candidate[];
  ballots: Ballot[];
  voters: Voter[];
  auditLogs?: AuditLogEntry[];
}

export const PrintableReport: React.FC<PrintableReportProps> = ({
  config,
  status,
  positions,
  candidates,
  ballots,
  voters,
  auditLogs = [],
}) => {
  const report = calculateElectionTallies(positions, candidates, ballots, voters);

  // Extract key timestamps for print certification
  const startedLog = auditLogs.find((l) => l.eventType === 'voting_opened');
  const firstVoteLog = auditLogs.find(
    (l) => l.eventType === 'ballot_submitted' && !l.details.toLowerCase().includes('practice')
  );
  const closedLog = auditLogs.find((l) => l.eventType === 'voting_closed');
  const publishedLog = auditLogs.find((l) => l.eventType === 'results_published');

  const formatLogTime = (iso: string | null | undefined) => {
    if (!iso) return 'Not Recorded / Pending';
    try {
      return new Date(iso).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
    } catch {
      return 'Not Recorded';
    }
  };

  return (
    <div id="official-printable-certificate" className="hidden print:block p-8 max-w-4xl mx-auto bg-white text-black font-serif">
      {/* Official Certificate Header */}
      <div className="text-center border-b-2 border-black pb-6 mb-6 flex flex-col items-center justify-center">
        <SchoolLogo
          logoUrl={config.logoUrl}
          schoolName={config.schoolName}
          size="lg"
          shape="shield"
          isPrint={true}
          className="mb-3"
        />
        <h3 className="text-xl font-bold tracking-wider uppercase mb-1">{config.schoolName}</h3>
        <h1 className="text-3xl font-extrabold tracking-tight uppercase mb-2">
          Official Certificate of Election Results
        </h1>
        <p className="text-base font-semibold italic">{config.title}</p>
        <p className="text-sm mt-1">Election Date: {config.date}</p>
      </div>

      {/* Official Turnout Summary Table */}
      <div className="mb-6">
        <h4 className="text-sm font-bold uppercase tracking-wider border-b border-black pb-1 mb-3">
          1. Voter Participation & Turnout Audit
        </h4>
        <table className="w-full text-left text-sm border border-black mb-4">
          <tbody>
            <tr className="border-b border-black">
              <td className="p-2 font-bold bg-gray-100 border-r border-black w-1/2">
                Total Registered Eligible Students:
              </td>
              <td className="p-2 font-mono font-bold">{report.totalRegisteredVoters}</td>
            </tr>
            <tr className="border-b border-black">
              <td className="p-2 font-bold bg-gray-100 border-r border-black">
                Total Valid Ballots Cast:
              </td>
              <td className="p-2 font-mono font-bold">{report.totalBallotsCast}</td>
            </tr>
            <tr>
              <td className="p-2 font-bold bg-gray-100 border-r border-black">
                Official Voter Turnout Percentage:
              </td>
              <td className="p-2 font-mono font-bold">{report.turnoutPercentage}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Official Audit Milestones & Timestamps */}
      <div className="mb-6">
        <h4 className="text-sm font-bold uppercase tracking-wider border-b border-black pb-1 mb-3">
          2. Certified Timeline & Key Audit Timestamps
        </h4>
        <table className="w-full text-left text-xs border border-black mb-4">
          <thead>
            <tr className="bg-gray-100 border-b border-black font-bold">
              <th className="p-2 border-r border-black w-1/3">Milestone Stage</th>
              <th className="p-2 border-r border-black w-1/3">Recorded Audit Timestamp</th>
              <th className="p-2 w-1/3">Audit Verification Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black">
              <td className="p-2 font-bold border-r border-black">Election Started</td>
              <td className="p-2 font-mono border-r border-black">{formatLogTime(startedLog?.timestamp)}</td>
              <td className="p-2">{startedLog ? 'Logged (voting_opened)' : status !== 'Setup' ? 'Commenced' : 'Pending'}</td>
            </tr>
            <tr className="border-b border-black">
              <td className="p-2 font-bold border-r border-black">First Vote Cast</td>
              <td className="p-2 font-mono border-r border-black">{formatLogTime(firstVoteLog?.timestamp || ballots[0]?.submittedAt)}</td>
              <td className="p-2">{firstVoteLog || ballots.length > 0 ? 'Logged (ballot_submitted)' : 'Awaiting Ballots'}</td>
            </tr>
            <tr className="border-b border-black">
              <td className="p-2 font-bold border-r border-black">Voting Closed</td>
              <td className="p-2 font-mono border-r border-black">{formatLogTime(closedLog?.timestamp)}</td>
              <td className="p-2">{closedLog ? 'Logged (voting_closed)' : status === 'Closed' || status === 'Results Published' ? 'Polls Concluded' : 'In Progress'}</td>
            </tr>
            <tr>
              <td className="p-2 font-bold border-r border-black">Results Published</td>
              <td className="p-2 font-mono border-r border-black">{formatLogTime(publishedLog?.timestamp)}</td>
              <td className="p-2">{publishedLog || status === 'Results Published' ? 'Certified & Published' : 'Pending Publication'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Position Results Breakdown */}
      <div className="mb-8 space-y-6">
        <h4 className="text-sm font-bold uppercase tracking-wider border-b border-black pb-1 mb-3">
          3. Certified Ballots & Election Outcomes by Position
        </h4>

        {positions.map((pos, idx) => {
          const tally = report.positionTallies[pos.id];
          if (!tally) return null;

          return (
            <div key={pos.id} className="border border-black p-4 rounded-xs break-inside-avoid">
              <div className="flex justify-between items-baseline border-b border-gray-400 pb-2 mb-3">
                <h5 className="text-base font-bold uppercase">
                  {idx + 1}. {pos.title}
                </h5>
                <div className="text-xs">
                  Valid Votes: <strong>{tally.validVotes}</strong> &bull; Abstentions:{' '}
                  <strong>{tally.abstainVotes}</strong>
                </div>
              </div>

              {/* Winner declaration */}
              <div className="mb-3 p-2 bg-gray-100 border border-black text-sm">
                {tally.isTie ? (
                  <div className="font-bold text-black uppercase">
                    &bull; OFFICIAL TIE DECLARED: {tally.tiedCandidates.map((c) => c.name).join(' and ')} ({tally.candidates[0].votes} votes each)
                  </div>
                ) : tally.winners.length > 0 ? (
                  <div className="font-bold text-black uppercase">
                    &bull; DECLARED WINNER: {tally.winners[0].name} ({tally.candidates[0].votes} votes &bull; {tally.candidates[0].percentageOfValid}%)
                  </div>
                ) : (
                  <div className="italic text-gray-700">No votes recorded.</div>
                )}
              </div>

              {/* Table of candidate votes */}
              <table className="w-full text-left text-xs border border-black">
                <thead>
                  <tr className="bg-gray-200 border-b border-black uppercase font-bold">
                    <th className="p-1.5 border-r border-black">Candidate</th>
                    <th className="p-1.5 border-r border-black text-right">Votes</th>
                    <th className="p-1.5 border-r border-black text-right">% of Valid</th>
                    <th className="p-1.5 text-right">% of Total Ballots</th>
                  </tr>
                </thead>
                <tbody>
                  {tally.candidates.map((cand) => (
                    <tr key={cand.candidate.id} className="border-b border-gray-300">
                      <td className="p-1.5 border-r border-black font-semibold">
                        {cand.candidate.name}
                      </td>
                      <td className="p-1.5 border-r border-black text-right font-mono font-bold">
                        {cand.votes}
                      </td>
                      <td className="p-1.5 border-r border-black text-right font-mono">
                        {cand.percentageOfValid}%
                      </td>
                      <td className="p-1.5 text-right font-mono">{cand.percentageOfTotal}%</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 italic">
                    <td className="p-1.5 border-r border-black">Abstained / Blank Ballots</td>
                    <td className="p-1.5 border-r border-black text-right font-mono">
                      {tally.abstainVotes}
                    </td>
                    <td className="p-1.5 border-r border-black text-right font-mono">N/A</td>
                    <td className="p-1.5 text-right font-mono">
                      {tally.totalVotes > 0
                        ? ((tally.abstainVotes / tally.totalVotes) * 100).toFixed(1)
                        : 0}
                      %
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Official Sign-off Blocks */}
      <div className="border-t-2 border-black pt-6 mt-8 break-inside-avoid">
        <p className="text-xs mb-6 leading-relaxed">
          I hereby certify that this election was conducted in full compliance with student electoral
          statutes. All voter IDs were normalized and verified to prevent duplicate voting, ballots
          were recorded confidentially, and all tallies have been audited.
        </p>

        <div className="grid grid-cols-2 gap-12 pt-6 text-sm">
          <div>
            <div className="border-b border-black mb-1 w-full h-8" />
            <p className="font-bold uppercase text-xs">Chief Electoral Commissioner / Returning Officer</p>
            <p className="text-2xs text-gray-600">Signature & Date</p>
          </div>

          <div>
            <div className="border-b border-black mb-1 w-full h-8" />
            <p className="font-bold uppercase text-xs">School Principal / Staff Election Advisor</p>
            <p className="text-2xs text-gray-600">Signature & Date</p>
          </div>
        </div>
      </div>
    </div>
  );
};
