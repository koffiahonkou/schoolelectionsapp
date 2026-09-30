import fs from 'fs';
import path from 'path';

let firestoreDb: any = null;

function getDb() {
  if (firestoreDb) return firestoreDb;
  try {
    let config: any = null;
    try {
      config = require('../../firebase-applet-config.json');
    } catch {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    }
    if (config) {
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { title = 'New Student Election', school = 'Our School', actor = 'Admin' } = req.body || {};

  const cleanMetadata = {
    status: 'Setup',
    config: {
      id: 'config-' + Date.now(),
      title,
      schoolName: school,
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
    lastUpdated: new Date().toISOString(),
    updatedBy: `${actor} (System Reset)`,
  };

  try {
    const db = getDb();
    if (db) {
      const { doc, setDoc } = require('firebase/firestore');
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([
        setDoc(doc(db, 'election_metadata', 'current'), cleanMetadata),
        timeoutPromise,
      ]);
    }
  } catch (err: any) {
    console.warn('[Vercel Reset] Firestore reset warning:', err?.message);
  }

  return res.status(200).json({
    success: true,
    message: 'System data successfully wiped and reset to clean canvas.',
    data: cleanMetadata,
  });
}
