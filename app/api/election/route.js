import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

let firestoreDb = null;

function getDb() {
  if (firestoreDb) return firestoreDb;
  try {
    let config = null;
    try {
      config = require('../../../firebase-applet-config.json');
    } catch {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
      } catch {
        // config file not found
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
      const app = getApps().length > 0
        ? getApp()
        : initializeApp({ apiKey, projectId, authDomain, storageBucket, messagingSenderId, appId });
      firestoreDb = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
        ? getFirestore(app, firestoreDatabaseId)
        : getFirestore(app);
    }
  } catch (err) {
    console.warn('[app/api/election] Firebase initialization warning:', err);
  }
  return firestoreDb;
}

/**
 * GET /api/election
 * Returns the current canonical election state. Never crashes with 503.
 */
export async function GET() {
  try {
    const db = getDb();
    if (db) {
      const { doc, getDoc } = require('firebase/firestore');
      const metaSnap = await getDoc(doc(db, 'election_metadata', 'current'));
      if (metaSnap.exists()) {
        const cloud = metaSnap.data();
        let stats = {};
        try {
          const statsSnap = await getDoc(doc(db, 'election_stats', 'current'));
          if (statsSnap.exists()) {
            stats = statsSnap.data();
          }
        } catch {
          // non-fatal stats lookup
        }

        const resolvedStatus = cloud.status || (cloud.config?.status === 'Active' ? 'Open' : cloud.config?.status) || 'Open';
        const payload = {
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
        };

        return Response.json(
          { success: true, data: payload, status: resolvedStatus, timestamp: new Date().toISOString() },
          { status: 200, headers: CORS_HEADERS }
        );
      }
    }

    // Fallback if metadata doc not initialized yet
    return Response.json(
      {
        success: true,
        data: null,
        status: 'Open',
        message: 'No metadata in Firestore yet. Connect client to initialize.',
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[app/api/election] GET error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/**
 * POST /api/election
 * Acknowledges or persists state update.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    return Response.json(
      {
        success: true,
        message: 'Election state acknowledged',
        data: body.data,
        status: body.status || 'Open',
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || 'Invalid payload' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}

/**
 * OPTIONS /api/election
 * CORS preflight handling
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
