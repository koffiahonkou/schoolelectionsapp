import {
  ABSTAIN_SELECTION,
  Ballot,
  Candidate,
  ElectionTallyReport,
  Position,
  PositionTally,
  Voter,
} from '../types';

/**
 * Normalizes a voter ID by trimming whitespace and converting to uppercase.
 * Prevents case sensitivity and spacing duplicate votes.
 */
export function normalizeVoterId(rawId: string): string {
  if (!rawId) return '';
  return rawId.trim().toUpperCase();
}

/**
 * Validates a voter's credentials against the current roster.
 */
export function validateVoterLogin(
  roster: Voter[],
  rawId: string,
  rawPin: string | undefined,
  requirePin: boolean,
  options?: { allowAlreadyVoted?: boolean }
): {
  success: boolean;
  voter?: Voter;
  message: string;
} {
  const normalized = normalizeVoterId(rawId);
  if (!normalized) {
    return { success: false, message: 'Please enter your Voter / Student ID.' };
  }

  const voter = roster.find((v) => normalizeVoterId(v.voterId) === normalized);

  if (!voter) {
    return {
      success: false,
      message: `Voter ID "${rawId.trim()}" was not found in the official election roster. Please see your teacher or election officer.`,
    };
  }

  if (!options?.allowAlreadyVoted && voter.hasVoted) {
    const formattedDate = voter.votedAt
      ? new Date(voter.votedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    return {
      success: false,
      message: `This Voter ID has already cast an official ballot${
        formattedDate ? ` at ${formattedDate}` : ''
      }. Only one ballot is permitted per student.`,
    };
  }

  if (requirePin) {
    const expectedPin = (voter.pin || '').trim().toUpperCase();
    const providedPin = (rawPin || '').trim().toUpperCase();
    if (!expectedPin && !providedPin) {
      // If PIN is required globally but this voter has no PIN assigned, allow or require blank
    } else if (expectedPin !== providedPin) {
      return {
        success: false,
        message: 'Invalid Access PIN / Security Code for this Voter ID. Please verify your assigned 8-digit unique code.',
      };
    }
  }

  return { success: true, voter, message: 'Access granted.' };
}

/**
 * Computes official election tallies including candidate vote counts,
 * percentages, explicit tie detection, and separate abstain counters.
 */
export function calculateElectionTallies(
  positions: Position[],
  candidates: Candidate[],
  ballots: Ballot[],
  voters: Voter[],
  includePractice: boolean = false
): ElectionTallyReport {
  // Filter active official ballots unless counting practice
  const relevantBallots = ballots.filter((b) => (includePractice ? true : !b.isPractice));
  const totalRegisteredVoters = voters.length;
  const totalBallotsCast = relevantBallots.length;
  const turnoutPercentage =
    totalRegisteredVoters > 0
      ? Number(((totalBallotsCast / totalRegisteredVoters) * 100).toFixed(1))
      : 0;

  const positionTallies: Record<string, PositionTally> = {};

  for (const position of positions) {
    const posCandidates = candidates.filter((c) => c.positionId === position.id);
    const voteCounts: Record<string, number> = {};
    let abstainCount = 0;

    for (const cand of posCandidates) {
      voteCounts[cand.id] = 0;
    }

    for (const ballot of relevantBallots) {
      const choice = ballot.choices[position.id];
      if (choice === ABSTAIN_SELECTION || !choice) {
        abstainCount++;
      } else if (voteCounts[choice] !== undefined) {
        voteCounts[choice]++;
      }
    }

    const validVotes = Object.values(voteCounts).reduce((sum, v) => sum + v, 0);
    const totalVotes = validVotes + abstainCount;

    const candidateResults = posCandidates.map((cand) => {
      const votes = voteCounts[cand.id] || 0;
      const percentageOfValid =
        validVotes > 0 ? Number(((votes / validVotes) * 100).toFixed(1)) : 0;
      const percentageOfTotal =
        totalVotes > 0 ? Number(((votes / totalVotes) * 100).toFixed(1)) : 0;

      return {
        candidate: cand,
        votes,
        percentageOfValid,
        percentageOfTotal,
      };
    });

    // Sort descending by votes
    candidateResults.sort((a, b) => b.votes - a.votes);

    // Determine winner(s) and tie handling
    let winners: Candidate[] = [];
    let isTie = false;
    let tiedCandidates: Candidate[] = [];

    if (candidateResults.length > 0 && validVotes > 0) {
      const topVotes = candidateResults[0].votes;
      const topTied = candidateResults.filter((c) => c.votes === topVotes && c.votes > 0);

      if (topTied.length > 1) {
        isTie = true;
        tiedCandidates = topTied.map((t) => t.candidate);
        winners = tiedCandidates;
      } else if (topTied.length === 1) {
        winners = [topTied[0].candidate];
      }
    }

    positionTallies[position.id] = {
      position,
      candidates: candidateResults,
      validVotes,
      abstainVotes: abstainCount,
      totalVotes,
      winners,
      isTie,
      tiedCandidates,
    };
  }

  return {
    totalRegisteredVoters,
    totalBallotsCast,
    turnoutPercentage,
    positionTallies,
  };
}
