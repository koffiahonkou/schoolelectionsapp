import fs from 'fs';
import path from 'path';

let firestoreDb: any = null;

function getDb() {
  if (firestoreDb) return firestoreDb;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const { initializeApp, getApps, getApp } = require('firebase/app');
      const { getFirestore } = require('firebase/firestore');
      const app = getApps().length > 0 ? getApp() : initializeApp(config);
      firestoreDb = getFirestore(app, config.firestoreDatabaseId);
    }
  } catch {
    // ignore
  }
  return firestoreDb;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'Election update endpoint active. Accepts POST or PUT requests.',
    });
  }

  try {
    const { data, status, actor, actorRole, actionDescription } = req.body || {};
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '127.0.0.1';

    // Persist to Firestore so serverless Vercel updates propagate across all users & devices
    try {
      const db = getDb();
      if (db && (status || data)) {
        const { doc, setDoc } = require('firebase/firestore');
        const updatePayload: Record<string, any> = {
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
      }
    } catch (e) {
      console.warn('[Vercel API] Firestore update error:', e);
    }

    return res.status(200).json({
      success: true,
      message: 'Election state updated successfully',
      data,
      status: status || 'Open',
      clientIp,
      actionDescription: actionDescription || 'Election state updated',
      actor: actor ? `${actor} (${actorRole || 'Staff'})` : 'Admin',
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error?.message || 'Failed to update election state',
    });
  }
}
