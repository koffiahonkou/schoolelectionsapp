import fs from 'fs';
import path from 'path';

let firestoreDb: any = null;

function getDb() {
  if (firestoreDb) return firestoreDb;
  try {
    let config: any = null;
    try {
      config = require('../firebase-applet-config.json');
    } catch {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    }

    const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || config?.apiKey;
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || config?.projectId;
    const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || config?.authDomain;
    const storageBucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || config?.storageBucket;
    const messagingSenderId = process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || config?.messagingSenderId;
    const appId = process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || config?.appId;
    const firestoreDatabaseId = process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || process.env.FIREBASE_FIRESTORE_DATABASE_ID || config?.firestoreDatabaseId;

    if (apiKey && projectId) {
      const { initializeApp, getApps, getApp } = require('firebase/app');
      const { getFirestore } = require('firebase/firestore');
      const app =
        getApps().length > 0
          ? getApp()
          : initializeApp({
              apiKey,
              projectId,
              authDomain,
              storageBucket,
              messagingSenderId,
              appId,
            });
      firestoreDb = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
        ? getFirestore(app, firestoreDatabaseId)
        : getFirestore(app);
    }
  } catch (err) {
    console.error('getDb error in api/vote:', err);
  }
  return firestoreDb;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { voterId, passcode, choices, isPractice } = req.body || {};
    if (!choices || typeof choices !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid ballot choices payload.' });
    }

    const ballotId = 'bal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const submittedAt = new Date().toISOString();

    if (isPractice) {
      return res.status(200).json({
        success: true,
        ballotId: 'practice-' + ballotId,
        timestamp: submittedAt,
        message: 'Practice ballot recorded locally.',
      });
    }

    const db = getDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database connection unavailable. Please check Vercel Firebase environment variables.',
      });
    }

    const { doc, runTransaction, serverTimestamp } = require('firebase/firestore');
    const cleanId = voterId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    const voterRef = doc(db, 'voters', cleanId);
    const tokenRef = doc(db, 'voter_tokens', `token-${cleanId}`);
    const statsRef = doc(db, 'election_stats', 'current');
    const ballotRef = doc(db, 'votes', ballotId);

    // Atomic Voting Transaction
    await runTransaction(db, async (transaction: any) => {
      // 1. Read voter's document
      let voterData: any = null;
      const voterDoc = await transaction.get(voterRef);
      if (voterDoc.exists()) {
        voterData = voterDoc.data();
      } else {
        const tokenDoc = await transaction.get(tokenRef);
        if (tokenDoc.exists()) {
          voterData = tokenDoc.data();
        } else {
          throw new Error(`Student ID (${voterId.trim()}) was not found on the registered voter roll.`);
        }
      }

      if (voterData.hasVoted || voterData.status === 'used') {
        const err: any = new Error(
          `This Student ID (${voterId.trim()}) has already cast an official ballot. Only one ballot is permitted per student.`
        );
        err.statusCode = 409;
        throw err;
      }

      if (
        passcode &&
        voterData.pin &&
        passcode.trim().toUpperCase() !== voterData.pin.trim().toUpperCase()
      ) {
        const err: any = new Error('Invalid access PIN provided for this student ID.');
        err.statusCode = 401;
        throw err;
      }

      // 2. Read election_stats/current document
      const statsDoc = await transaction.get(statsRef);
      const statsData = statsDoc.exists() ? statsDoc.data() : {};
      const currentTotalVotes = statsData.totalVotesCast || 0;
      const totalEligible = statsData.totalEligibleVoters || 389;
      const newTotalVotes = currentTotalVotes + 1;
      const newTurnout = Math.round((newTotalVotes / totalEligible) * 1000) / 10;

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
          positionTallies[posId].candidateCounts[candId as string] =
            (positionTallies[posId].candidateCounts[candId as string] || 0) + 1;
          candidateVotes[candId as string] = (candidateVotes[candId as string] || 0) + 1;
        }
      }

      // 3. Mark voter document as voted
      transaction.set(
        voterRef,
        {
          hasVoted: true,
          votedAt: submittedAt,
        },
        { merge: true }
      );

      transaction.set(
        tokenRef,
        {
          hasVoted: true,
          votedAt: submittedAt,
          status: 'used',
        },
        { merge: true }
      );

      // 4. Create new anonymous vote document in votes collection
      transaction.set(ballotRef, {
        id: ballotId,
        choices,
        submittedAt,
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
          lastVoteAt: submittedAt,
          candidateVotes,
          positionTallies,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    const ballot = {
      id: ballotId,
      submittedAt,
      isPractice: false,
      choices,
    };

    return res.status(200).json({
      success: true,
      ballotId,
      timestamp: submittedAt,
      ballot,
      message: 'Ballot verified and deposited successfully.',
    });
  } catch (error: any) {
    const statusCode = error?.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Server error processing ballot',
    });
  }
}

