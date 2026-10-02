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
    console.error('getDb error in api/election:', err);
  }
  return firestoreDb;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database configuration missing. Please configure Vercel Firebase environment variables.',
      });
    }

    const { doc, getDoc } = require('firebase/firestore');
    const snap = await getDoc(doc(db, 'election_metadata', 'current'));

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'Election metadata not found in Firestore. Please initialize the election in Admin.',
      });
    }

    const cloud = snap.data();
    let electionStatus = cloud.status || (cloud.config?.status === 'Active' ? 'Open' : cloud.config?.status) || 'Setup';

    // Fetch stats for live tallies
    let stats: any = {};
    try {
      const statsSnap = await getDoc(doc(db, 'election_stats', 'current'));
      if (statsSnap.exists()) {
        stats = statsSnap.data();
      }
    } catch {
      // non-fatal
    }

    const electionPayload = {
      config: cloud.config || {},
      positions: cloud.positions || [],
      candidates: cloud.candidates || [],
      voters: cloud.voters || [],
      accounts: cloud.accounts || [],
      ballots: [],
      stats: {
        totalEligibleVoters: stats.totalEligibleVoters || cloud.voters?.length || 389,
        totalVotesCast: stats.totalVotesCast || 0,
        turnoutPercentage: stats.turnoutPercentage || 0,
        candidateVotes: stats.candidateVotes || {},
        positionTallies: stats.positionTallies || {},
      },
      auditLogs: [],
      startTime: cloud.startTime || null,
      endTime: cloud.endTime || null,
    };

    if (req.method === 'POST') {
      return res.status(200).json({
        success: true,
        message: 'Election state acknowledged',
        data: electionPayload,
        status: electionStatus,
      });
    }

    return res.status(200).json({
      success: true,
      data: electionPayload,
      status: electionStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      error: `Failed to connect to Firebase Firestore: ${err.message || err}`,
    });
  }
}

