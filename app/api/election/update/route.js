import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PUT, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

let firestoreDb = null;

function getDb() {
  if (firestoreDb) return firestoreDb;
  try {
    let config = null;
    try {
      config = require('../../../../firebase-applet-config.json');
    } catch {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
      } catch {
        // config not found
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
    console.warn('[app/api/election/update] Firebase initialization warning:', err);
  }
  return firestoreDb;
}

async function handleUpdate(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { data, status, actor, actorRole, actionDescription } = body || {};

    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    // Persist to Firestore
    try {
      const db = getDb();
      if (db && (status || data)) {
        const { doc, setDoc } = require('firebase/firestore');
        const updatePayload = {
          lastUpdated: new Date().toISOString(),
          updatedBy: actor ? `${actor} (${actorRole || 'Staff'})` : 'Admin',
        };
        if (status) updatePayload.status = status;
        if (data?.config) updatePayload.config = data.config;
        if (Array.isArray(data?.positions)) updatePayload.positions = data.positions;
        if (Array.isArray(data?.candidates)) updatePayload.candidates = data.candidates;
        if (Array.isArray(data?.voters)) {
          updatePayload.voters = data.voters;
          updatePayload.totalEligibleVoters = data.voters.length;
        }
        if (Array.isArray(data?.accounts)) updatePayload.accounts = data.accounts;

        await setDoc(doc(db, 'election_metadata', 'current'), updatePayload, { merge: true });

        // Update stats document totalEligibleVoters if roster provided
        if (Array.isArray(data?.voters)) {
          await setDoc(
            doc(db, 'election_stats', 'current'),
            { totalEligibleVoters: data.voters.length },
            { merge: true }
          ).catch(() => {});
        }
      }
    } catch (dbErr) {
      console.warn('[app/api/election/update] Firestore sync warning:', dbErr);
    }

    return Response.json(
      {
        success: true,
        message: 'Election state updated successfully',
        data,
        status: status || 'Open',
        clientIp,
        actionDescription: actionDescription || 'Election state updated',
        actor: actor ? `${actor} (${actorRole || 'Staff'})` : 'Admin',
        updatedAt: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[app/api/election/update] Error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Failed to process election update' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/**
 * POST /api/election/update
 */
export async function POST(request) {
  return handleUpdate(request);
}

/**
 * PUT /api/election/update
 */
export async function PUT(request) {
  return handleUpdate(request);
}

/**
 * GET /api/election/update
 * Status probe preventing 405 Method Not Allowed
 */
export async function GET() {
  return Response.json(
    {
      success: true,
      message: 'Election update endpoint active. Accepts POST and PUT requests.',
      allowedMethods: ['POST', 'PUT', 'GET', 'OPTIONS'],
    },
    { status: 200, headers: CORS_HEADERS }
  );
}

/**
 * OPTIONS /api/election/update
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
