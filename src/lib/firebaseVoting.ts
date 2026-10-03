import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  getDoc,
  getDocFromCache,
  onSnapshot,
  query,
  orderBy,
  Unsubscribe,
  writeBatch,
  runTransaction,
  increment,
  serverTimestamp,
  getCountFromServer,
  Timestamp,
} from 'firebase/firestore';
import { db, FIREBASE_PROJECT_ID, FIRESTORE_DB_ID } from './firebase';
import { Ballot, Voter, ElectionData, ElectionStatus } from '../types';

export { FIREBASE_PROJECT_ID, FIRESTORE_DB_ID };

export interface ElectionStatsRecord {
  totalEligibleVoters: number;
  totalVotesCast: number;
  turnoutPercentage: number;
  lastVoteAt: string | null;
  candidateVotes?: Record<string, number>;
  positionTallies?: Record<
    string,
    {
      totalVotes: number;
      validVotes: number;
      abstainVotes: number;
      candidateCounts: Record<string, number>;
    }
  >;
  updatedAt?: any;
}

export interface AgentObserverRecord {
  id: string;
  agentName: string;
  representedCandidate: string;
  role: 'Candidate Agent' | 'Independent Observer' | 'Electoral Commission Monitor';
  status: 'online' | 'observing' | 'offline';
  lastHeartbeat: string;
  station: string;
  notes?: string;
}

export interface VoterTokenRecord {
  id: string;
  voterId: string;
  token: string;
  fullName: string;
  hasVoted: boolean;
  votedAt: string | null;
  status: 'active' | 'used' | 'revoked';
  issuedAt: string;
}

/**
 * Executes an atomic Firestore runTransaction to cast an official ballot:
 * 1. Reads the voter's document to ensure they have not already voted.
 * 2. Marks the voter's document with hasVoted: true and server votedAt timestamp.
 * 3. Creates an anonymous cast ballot in the 'votes' collection (no personal identity).
 * 4. Reads and increments totalVotesCast and candidate vote counts in election_stats/current.
 * 5. Updates turnout percentage and commits atomically.
 */
export async function submitVoteTransaction(
  voterId: string,
  passcode: string,
  choices: Record<string, string>,
  isPractice: boolean = false
): Promise<{ success: boolean; error?: string; ballotId?: string }> {
  // Practice votes do not touch real voter documents or real stats
  if (isPractice) {
    const practiceId = `practice-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    return { success: true, ballotId: practiceId };
  }

  const cleanId = voterId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  const voterRef = doc(db, 'voters', cleanId);
  const tokenRef = doc(db, 'voter_tokens', `token-${cleanId}`);
  const statsRef = doc(db, 'election_stats', 'current');
  const ballotId = `bal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const voteRef = doc(db, 'votes', ballotId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      // 1. Read voter document in transaction
      const voterDoc = await transaction.get(voterRef);
      let voterData: any = null;

      if (voterDoc.exists()) {
        voterData = voterDoc.data();
      } else {
        // Fallback: check voter_tokens doc
        const tokenDoc = await transaction.get(tokenRef);
        if (tokenDoc.exists()) {
          voterData = tokenDoc.data();
        } else {
          throw new Error(`Student ID (${voterId.trim()}) was not found on the registered voter roll.`);
        }
      }

      // Check if voter has already voted
      if (voterData.hasVoted || voterData.status === 'used') {
        throw new Error(
          `This Student ID (${voterId.trim()}) has already cast an official ballot. Only one ballot is permitted per student.`
        );
      }

      // Validate PIN/passcode if provided
      if (
        passcode &&
        voterData.pin &&
        passcode.trim().toUpperCase() !== voterData.pin.trim().toUpperCase()
      ) {
        throw new Error('Invalid security PIN provided for this student ID.');
      }
      if (
        passcode &&
        voterData.token &&
        passcode.trim().toUpperCase() !== voterData.token.trim().toUpperCase()
      ) {
        throw new Error('Invalid security PIN provided for this student ID.');
      }

      // 2. Read election_stats/current document
      const statsDoc = await transaction.get(statsRef);
      const statsData = statsDoc.exists() ? statsDoc.data() : {};
      const currentTotalVotes = statsData.totalVotesCast || 0;
      const totalEligible = statsData.totalEligibleVoters || 389;
      const newTotalVotes = currentTotalVotes + 1;
      const newTurnout = Math.round((newTotalVotes / totalEligible) * 1000) / 10;

      // Update candidate votes and position tallies
      const candidateVotes = { ...(statsData.candidateVotes || {}) };
      const positionTallies = { ...(statsData.positionTallies || {}) };

      for (const [posId, candId] of Object.entries(choices)) {
        if (!positionTallies[posId]) {
          positionTallies[posId] = {
            totalVotes: 0,
            validVotes: 0,
            abstainVotes: 0,
            candidateCounts: {},
          };
        }
        positionTallies[posId].totalVotes = (positionTallies[posId].totalVotes || 0) + 1;

        if (candId === 'ABSTAIN') {
          positionTallies[posId].abstainVotes = (positionTallies[posId].abstainVotes || 0) + 1;
        } else if (candId) {
          positionTallies[posId].validVotes = (positionTallies[posId].validVotes || 0) + 1;
          positionTallies[posId].candidateCounts = positionTallies[posId].candidateCounts || {};
          positionTallies[posId].candidateCounts[candId] =
            (positionTallies[posId].candidateCounts[candId] || 0) + 1;
          candidateVotes[candId] = (candidateVotes[candId] || 0) + 1;
        }
      }

      const nowIso = new Date().toISOString();

      // 3. Mark voter document as voted
      transaction.set(
        voterRef,
        {
          hasVoted: true,
          votedAt: nowIso,
        },
        { merge: true }
      );

      // Also update token document for backward compatibility
      transaction.set(
        tokenRef,
        {
          hasVoted: true,
          votedAt: nowIso,
          status: 'used',
        },
        { merge: true }
      );

      // 4. Create new anonymous vote document in votes collection (NO personal voter identifiers)
      transaction.set(voteRef, {
        id: ballotId,
        choices,
        submittedAt: nowIso,
        isPractice: false,
        clientTimestamp: Date.now(),
      });

      // 5. Update election_stats/current document
      transaction.set(
        statsRef,
        {
          totalVotesCast: newTotalVotes,
          totalEligibleVoters: totalEligible,
          turnoutPercentage: newTurnout,
          lastVoteAt: nowIso,
          candidateVotes,
          positionTallies,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return { ballotId };
    });

    return { success: true, ballotId: result.ballotId };
  } catch (error: any) {
    console.error('[Voting Transaction] Failed:', error);
    return { success: false, error: error.message || 'Transaction failed. Please try again.' };
  }
}

/**
 * Real-time listener on the single aggregated 'election_stats/current' document.
 * Crucial Firestore Quota Optimization:
 * Reduces real-time reads from 400 documents per client down to exactly 1 document read per update!
 */
export function subscribeToElectionStats(
  onStatsUpdate: (stats: ElectionStatsRecord) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const statsDocRef = doc(db, 'election_stats', 'current');
    return onSnapshot(
      statsDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          onStatsUpdate(docSnap.data() as ElectionStatsRecord);
        }
      },
      (err) => {
        onError?.(err);
      }
    );
  } catch (err: any) {
    onError?.(err);
    return () => {};
  }
}

/**
 * Aggregation query to fetch the total registered voter count efficiently.
 * Uses getCountFromServer (costs only 1 read per 1,000 documents).
 * Falls back to election_stats/current totalEligibleVoters if list is restricted.
 */
export async function getRegisteredVoterCount(): Promise<number> {
  try {
    const coll = collection(db, 'voters');
    const snapshot = await withTimeout(getCountFromServer(coll), 2500, null);
    if (snapshot && typeof snapshot.data().count === 'number') {
      return snapshot.data().count;
    }
  } catch {
    // If security rules disallow list queries on voters collection, read from aggregated stats
  }

  try {
    const statsSnap = await withTimeout(getDoc(doc(db, 'election_stats', 'current')), 2000, null);
    if (statsSnap && statsSnap.exists()) {
      return statsSnap.data().totalEligibleVoters || 389;
    }
  } catch {
    // ignore
  }

  return 389;
}

/**
 * Configures the election start and end timestamps in Firestore using Timestamp.fromDate.
 */
export async function configureElectionTimes(
  startDateStr: string,
  endDateStr: string,
  closingTimeStr: string = '20:00'
): Promise<boolean> {
  try {
    const cleanTime = closingTimeStr.trim().length === 5 ? `${closingTimeStr.trim()}:00` : closingTimeStr.trim();
    const startDateTime = new Date(`${startDateStr}T08:00:00Z`);
    const endDateTime = new Date(`${endDateStr}T${cleanTime}Z`);

    const startTimestamp = Timestamp.fromDate(isNaN(startDateTime.getTime()) ? new Date() : startDateTime);
    const endTimestamp = Timestamp.fromDate(
      isNaN(endDateTime.getTime()) ? new Date(Date.now() + 12 * 3600 * 1000) : endDateTime
    );

    const metaRef = doc(db, 'election_metadata', 'current');
    await updateDoc(metaRef, {
      startTime: startTimestamp,
      endTime: endTimestamp,
      serverTime: serverTimestamp(),
      lastUpdated: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.error('Failed to configure election timestamps:', err);
    return false;
  }
}


/**
 * Persists an anonymous cast ballot to Firestore.
 * CRITICAL SECRET BALLOT GUARANTEE:
 * Does NOT write studentId, voterId, studentName, or IP address into the ballot document.
 */
export async function saveAnonymousVoteToFirestore(ballot: Ballot): Promise<boolean> {
  try {
    const ballotRef = doc(db, 'votes', ballot.id);
    const votePayload = {
      id: ballot.id,
      choices: ballot.choices || {},
      submittedAt: ballot.submittedAt || new Date().toISOString(),
      isPractice: !!ballot.isPractice,
      evidenceHash: ballot.evidenceHash || null,
      clientTimestamp: Date.now(),
    };

    await setDoc(ballotRef, votePayload);
    return true;
  } catch (error) {
    console.error('[Firebase] Failed to save anonymous vote to Firestore:', error);
    return false;
  }
}

/**
 * Checks in real-time whether a voter token exists and whether it has already been used to cast a ballot.
 */
export async function checkVoterTokenInFirestore(
  voterId: string
): Promise<{
  exists: boolean;
  hasVoted: boolean;
  votedAt: string | null;
  pin?: string;
}> {
  try {
    const cleanId = voterId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    const tokenRef = doc(db, 'voter_tokens', `token-${cleanId}`);
    const tokenTask = getDoc(tokenRef);
    const snap = await withTimeout(tokenTask, 2500, null);

    if (snap && snap.exists()) {
      const data = snap.data();
      return {
        exists: true,
        hasVoted: Boolean(data.hasVoted || data.status === 'used'),
        votedAt: data.votedAt || null,
        pin: data.token,
      };
    }

    // Fallback: Check election_metadata current roster in case tokens collection was not populated
    try {
      const metaRef = doc(db, 'election_metadata', 'current');
      const metaSnap = await withTimeout(getDoc(metaRef), 2000, null);
      if (metaSnap && metaSnap.exists()) {
        const meta = metaSnap.data();
        const found = (meta.voters || []).find(
          (v: any) => v.voterId?.trim().toUpperCase() === cleanId
        );
        if (found) {
          return {
            exists: true,
            hasVoted: Boolean(found.hasVoted),
            votedAt: found.votedAt || null,
            pin: found.pin,
          };
        }
      }
    } catch {
      // ignore
    }
  } catch (error) {
    console.warn('[Firebase] Could not verify voter token in Firestore:', error);
  }
  return { exists: false, hasVoted: false, votedAt: null };
}

/**
 * Updates a voter's token in Firestore to mark them as having cast their ballot.
 */
export async function markVoterTokenUsedInFirestore(
  voterId: string,
  votedAt?: string
): Promise<boolean> {
  try {
    const cleanId = voterId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    const tokenRef = doc(db, 'voter_tokens', `token-${cleanId}`);

    const updateData = {
      id: `token-${cleanId}`,
      voterId: voterId.trim().toUpperCase(),
      hasVoted: true,
      votedAt: votedAt || new Date().toISOString(),
      status: 'used' as const,
    };

    // Use atomic merge set so it always succeeds whether document existed or not
    const setTask = setDoc(tokenRef, updateData, { merge: true });
    await withTimeout(setTask, 2500, null);

    // Also update election_metadata/current roster so all devices see the vote on the roster
    try {
      const metaRef = doc(db, 'election_metadata', 'current');
      const metaSnap = await withTimeout(getDoc(metaRef), 2000, null);
      if (metaSnap && metaSnap.exists()) {
        const meta = metaSnap.data();
        if (Array.isArray(meta.voters)) {
          const updatedVoters = meta.voters.map((v: any) =>
            v.voterId.trim().toUpperCase() === voterId.trim().toUpperCase()
              ? { ...v, hasVoted: true, votedAt: updateData.votedAt }
              : v
          );
          const updateTask = updateDoc(metaRef, { voters: updatedVoters, lastUpdated: new Date().toISOString() });
          await withTimeout(updateTask, 2000, null);
        }
      }
    } catch (metaErr) {
      console.warn('[Firebase] Non-fatal metadata voter flag sync warning:', metaErr);
    }

    return true;
  } catch (error) {
    console.error('[Firebase] Failed to update voter token in Firestore:', error);
    return false;
  }
}

/**
 * Resets a single voter's token status in Firestore back to active/unvoted (Admin authorized).
 */
export async function resetVoterTokenInFirestore(voterId: string): Promise<boolean> {
  try {
    const cleanId = voterId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    const tokenRef = doc(db, 'voter_tokens', `token-${cleanId}`);
    const setTask = setDoc(
      tokenRef,
      {
        hasVoted: false,
        votedAt: null,
        status: 'active' as const,
      },
      { merge: true }
    );
    await withTimeout(setTask, 2500, null);

    // Also reset in election_metadata
    try {
      const metaRef = doc(db, 'election_metadata', 'current');
      const metaSnap = await withTimeout(getDoc(metaRef), 2000, null);
      if (metaSnap && metaSnap.exists()) {
        const meta = metaSnap.data();
        if (Array.isArray(meta.voters)) {
          const updatedVoters = meta.voters.map((v: any) =>
            v.voterId.trim().toUpperCase() === voterId.trim().toUpperCase()
              ? { ...v, hasVoted: false, votedAt: null }
              : v
          );
          const updateTask = updateDoc(metaRef, { voters: updatedVoters, lastUpdated: new Date().toISOString() });
          await withTimeout(updateTask, 2000, null);
        }
      }
    } catch {
      // ignore
    }
    return true;
  } catch (err) {
    console.warn('[Firebase] Could not reset voter token in Firestore:', err);
    return false;
  }
}

/**
 * Syncs the entire voter roster into Firestore voter_tokens collection.
 */
export async function syncVoterRosterToFirestoreTokens(
  voters: Voter[],
  clearOld: boolean = false
): Promise<{
  success: boolean;
  count: number;
}> {
  try {
    // If clearOld requested or roster is empty, purge stale voter tokens first
    if (clearOld || voters.length === 0) {
      const snap = await getDocs(collection(db, 'voter_tokens'));
      if (!snap.empty) {
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 400);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    }

    if (voters.length === 0) {
      return { success: true, count: 0 };
    }

    // Write in batches of up to 400 documents
    const batchSize = 400;
    let processed = 0;

    for (let i = 0; i < voters.length; i += batchSize) {
      const chunk = voters.slice(i, i + batchSize);
      const batch = writeBatch(db);

      for (const voter of chunk) {
        const cleanId = voter.voterId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
        const tokenRef = doc(db, 'voter_tokens', `token-${cleanId}`);
        batch.set(
          tokenRef,
          {
            id: `token-${cleanId}`,
            voterId: voter.voterId.trim().toUpperCase(),
            token: voter.pin || 'N/A',
            fullName: voter.fullName,
            hasVoted: !!voter.hasVoted,
            votedAt: voter.votedAt || null,
            status: voter.hasVoted ? 'used' : 'active',
            issuedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      await batch.commit();
      processed += chunk.length;
    }

    return { success: true, count: processed };
  } catch (error) {
    console.error('[Firebase] Failed to batch sync voter tokens to Firestore:', error);
    return { success: false, count: 0 };
  }
}

/**
 * Fetches the voter tokens once on demand using standard getDocs (to save read quota).
 */
export async function fetchVoterTokensOnce(): Promise<VoterTokenRecord[]> {
  try {
    const tokensQuery = query(collection(db, 'voter_tokens'));
    const snapshot = await getDocs(tokensQuery);
    const tokens: VoterTokenRecord[] = [];
    snapshot.forEach((docSnap) => {
      tokens.push(docSnap.data() as VoterTokenRecord);
    });
    return tokens;
  } catch (error) {
    console.warn('[Firebase] Notice on fetching voter tokens on-demand:', error);
    return [];
  }
}

/**
 * Fetches anonymous votes once on demand using standard getDocs.
 */
export async function fetchAnonymousVotesOnce(): Promise<Ballot[]> {
  try {
    const votesQuery = query(collection(db, 'votes'), orderBy('submittedAt', 'asc'));
    const snapshot = await getDocs(votesQuery);
    const ballots: Ballot[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      ballots.push({
        id: data.id || docSnap.id,
        choices: data.choices || {},
        submittedAt: data.submittedAt || new Date().toISOString(),
        isPractice: !!data.isPractice,
        evidenceHash: data.evidenceHash || undefined,
      });
    });
    return ballots;
  } catch (error) {
    console.warn('[Firebase] Notice on fetching votes on-demand:', error);
    return [];
  }
}

/**
 * Real-time listener on the Firestore 'votes' collection.
 * Triggers callback immediately on subscription and whenever a new anonymous vote is deposited.
 */
export function subscribeToAnonymousVotes(
  onVotesUpdate: (ballots: Ballot[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const votesQuery = query(collection(db, 'votes'));
    return onSnapshot(
      votesQuery,
      (snapshot) => {
        const ballots: Ballot[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          ballots.push({
            id: data.id || docSnap.id,
            choices: data.choices || {},
            submittedAt: data.submittedAt || new Date().toISOString(),
            isPractice: !!data.isPractice,
            evidenceHash: data.evidenceHash || undefined,
          });
        });
        ballots.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
        onVotesUpdate(ballots);
      },
      (err) => {
        // Soft fallback for offline/reconnecting states
        onError?.(err);
      }
    );
  } catch (err: any) {
    onError?.(err);
    return () => {};
  }
}

/**
 * Real-time listener on the Firestore 'voter_tokens' collection.
 */
export function subscribeToVoterTokens(
  onTokensUpdate: (tokens: VoterTokenRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const tokensQuery = query(collection(db, 'voter_tokens'));
    return onSnapshot(
      tokensQuery,
      (snapshot) => {
        const tokens: VoterTokenRecord[] = [];
        snapshot.forEach((docSnap) => {
          tokens.push(docSnap.data() as VoterTokenRecord);
        });
        onTokensUpdate(tokens);
      },
      (err) => {
        // Soft fallback for offline/reconnecting states
        onError?.(err);
      }
    );
  } catch (err: any) {
    onError?.(err);
    return () => {};
  }
}

/**
 * Real-time listener on the Firestore 'agent_monitoring' collection.
 */
export function subscribeToAgentMonitoring(
  onAgentsUpdate: (agents: AgentObserverRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const agentsQuery = query(collection(db, 'agent_monitoring'));
    return onSnapshot(
      agentsQuery,
      (snapshot) => {
        const agents: AgentObserverRecord[] = [];
        snapshot.forEach((docSnap) => {
          agents.push(docSnap.data() as AgentObserverRecord);
        });
        onAgentsUpdate(agents);
      },
      (err) => {
        // Soft fallback for offline/reconnecting states
        onError?.(err);
      }
    );
  } catch (err: any) {
    onError?.(err);
    return () => {};
  }
}

/**
 * Registers or sends a heartbeat ping for a live observer / candidate agent.
 */
export async function registerOrPingAgent(agent: AgentObserverRecord): Promise<boolean> {
  try {
    const agentRef = doc(db, 'agent_monitoring', agent.id);
    await setDoc(agentRef, {
      ...agent,
      lastHeartbeat: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error('[Firebase] Failed to register or ping agent:', error);
    return false;
  }
}

/**
 * Helper to race a promise with a timeout so Firestore operations never hang
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

/**
 * Purges all ballots in the Firestore 'votes' collection.
 * Used to reset the live ballot box without deleting roster or candidates.
 */
export async function clearAllFirestoreVotes(): Promise<boolean> {
  try {
    const doClearVotes = async () => {
      const snap = await getDocs(collection(db, 'votes'));
      if (!snap.empty) {
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 400);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      return true;
    };
    await withTimeout(doClearVotes(), 2500, false);
    return true;
  } catch (error) {
    console.warn('[Firebase] Non-fatal clear votes warning:', error);
    return true;
  }
}

/**
 * Completely purges all votes, voter tokens, and agent monitoring telemetry from Firestore
 * to make room for a completely fresh selection setup.
 */
export async function clearAllFirestoreElectionData(
  preservedAccounts?: any[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const doClear = async () => {
      const collectionsToClear = ['votes', 'voter_tokens', 'agent_monitoring'];
      for (const collName of collectionsToClear) {
        try {
          const snap = await getDocs(collection(db, collName));
          if (!snap.empty) {
            const docs = snap.docs;
            for (let i = 0; i < docs.length; i += 400) {
              const batch = writeBatch(db);
              const chunk = docs.slice(i, i + 400);
              chunk.forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
          }
        } catch (colErr) {
          console.warn(`[Firebase] Non-fatal clear error for ${collName}:`, colErr);
        }
      }

      // Reset election metadata to fresh setup
      try {
        const metaRef = doc(db, 'election_metadata', 'current');
        await setDoc(metaRef, {
          status: 'Setup',
          config: {
            id: 'config-' + Date.now(),
            title: 'New Student Election',
            schoolName: 'Our School',
            logoUrl: '',
            date: new Date().toISOString().split('T')[0],
            requirePin: true,
            adminPin: 'admin123',
            hideTalliesDuringVoting: true,
            allowPracticeBallot: true,
            showClockToVoters: true,
            enableCaptcha: true,
            closingTime: '20:00',
          },
          positions: [],
          candidates: [],
          voters: [],
          totalEligibleVoters: 0,
          accounts: preservedAccounts || [],
          lastUpdated: new Date().toISOString(),
          updatedBy: 'System Clear',
        });
      } catch (metaErr) {
        console.warn('[Firebase] Could not reset election_metadata document:', metaErr);
      }
    };

    await withTimeout(doClear(), 2500, null);
    return { success: true };
  } catch (error: any) {
    console.warn('[Firebase] Non-fatal clear error:', error);
    return { success: true };
  }
}

/**
 * Safely sanitizes an object for Firestore by removing undefined values and circular references.
 */
function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

/**
 * Saves or transitions election status (Setup, Open, Closed, Results Published) in Firestore.
 * This guarantees any device or refreshed browser across Netlify / mobile immediately knows polls are Open.
 */
export async function saveElectionStatusToFirestore(
  status: ElectionStatus,
  updatedBy: string = 'Admin'
): Promise<boolean> {
  try {
    const metaRef = doc(db, 'election_metadata', 'current');
    const updateTask = setDoc(
      metaRef,
      sanitizeForFirestore({
        status,
        lastUpdated: new Date().toISOString(),
        updatedBy,
      }),
      { merge: true }
    );
    await withTimeout(updateTask, 2500, null);
    return true;
  } catch (err) {
    console.warn('[Firebase] Failed to save election status to Firestore:', err);
    return false;
  }
}

/**
 * Saves canonical election configuration, positions, candidates, and voter roster into Firestore.
 * Allows other devices on Netlify to fetch the exact same configuration as the Commissioner.
 */
export async function saveElectionStateToFirestore(
  data: Partial<ElectionData>,
  status?: ElectionStatus,
  updatedBy: string = 'Admin'
): Promise<boolean> {
  try {
    const metaRef = doc(db, 'election_metadata', 'current');
    const payload: Record<string, any> = {
      lastUpdated: new Date().toISOString(),
      updatedBy,
    };

    if (status) payload.status = status;
    if (data.config) payload.config = data.config;
    if (data.positions !== undefined) payload.positions = data.positions;
    if (data.candidates !== undefined) payload.candidates = data.candidates;
    if (data.voters !== undefined) {
      payload.voters = data.voters;
      payload.totalEligibleVoters = data.voters.length;
    }
    if (data.accounts !== undefined) payload.accounts = data.accounts;

    const saveTask = setDoc(metaRef, sanitizeForFirestore(payload), { merge: true });
    await withTimeout(saveTask, 15000, null);

    // Also update election_stats document with totalEligibleVoters so turnout % reflects accurately
    if (data.voters !== undefined) {
      const statsRef = doc(db, 'election_stats', 'current');
      await setDoc(statsRef, { totalEligibleVoters: data.voters.length }, { merge: true }).catch(() => {});
    }

    return true;
  } catch (err) {
    console.warn('[Firebase] Failed to save election state to Firestore:', err);
    return false;
  }
}

/**
 * Reads canonical election metadata (status, config, positions, candidates, voters) from Firestore.
 */
export async function getElectionMetadataFromFirestore(): Promise<{
  status?: ElectionStatus;
  config?: any;
  positions?: any[];
  candidates?: any[];
  voters?: any[];
  accounts?: any[];
  totalEligibleVoters?: number;
  lastUpdated?: string;
} | null> {
  const metaRef = doc(db, 'election_metadata', 'current');
  try {
    const snap = await getDoc(metaRef);
    if (snap.exists()) {
      const data = snap.data();
      const resolvedStatus = data.status || (data.config?.status === 'Active' ? 'Open' : data.config?.status);
      return { ...data, status: resolvedStatus } as any;
    }
    return null;
  } catch {
    // If offline or network unavailable, seamlessly retrieve from local persistent cache
    try {
      const cacheSnap = await getDocFromCache(metaRef);
      if (cacheSnap.exists()) {
        const data = cacheSnap.data();
        const resolvedStatus = data.status || (data.config?.status === 'Active' ? 'Open' : data.config?.status);
        return { ...data, status: resolvedStatus } as any;
      }
    } catch {
      // Local cache empty or pending
    }
    return null;
  }
}

/**
 * Real-time listener on the Firestore 'election_metadata/current' document.
 * When status transitions from Setup -> Open on Commissioner's device,
 * all voter booths on Netlify / other devices instantly receive the update.
 */
export function subscribeToElectionMetadata(
  onMetadataUpdate: (metadata: {
    status?: ElectionStatus;
    config?: any;
    positions?: any[];
    candidates?: any[];
    voters?: any[];
    accounts?: any[];
    lastUpdated?: string;
  }) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const metaRef = doc(db, 'election_metadata', 'current');
    return onSnapshot(
      metaRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const resolvedStatus = data.status || (data.config?.status === 'Active' ? 'Open' : data.config?.status);
          onMetadataUpdate({
            status: resolvedStatus,
            config: data.config,
            positions: data.positions,
            candidates: data.candidates,
            voters: data.voters,
            accounts: data.accounts,
            lastUpdated: data.lastUpdated,
          });
        }
      },
      (err) => {
        // Soft fallback for offline/reconnecting states
        onError?.(err);
      }
    );
  } catch (err: any) {
    onError?.(err);
    return () => {};
  }
}


