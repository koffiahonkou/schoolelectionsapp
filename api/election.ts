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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    let electionPayload: any = null;
    let electionStatus = 'Setup';

    // 1. Try to fetch live canonical metadata from Firestore first
    try {
      const db = getDb();
      if (db) {
        const { doc, getDoc } = require('firebase/firestore');
        const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 2500));
        const snapPromise = getDoc(doc(db, 'election_metadata', 'current'));
        const snap = await Promise.race([snapPromise, timeoutPromise]);
        if (snap && snap.exists && snap.exists()) {
          const cloud = snap.data();
          if (cloud.status) {
            electionStatus = cloud.status;
          }
          if (cloud.positions || cloud.candidates || cloud.config) {
            electionPayload = {
              config: cloud.config,
              positions: cloud.positions || [],
              candidates: cloud.candidates || [],
              voters: cloud.voters || [],
              accounts: cloud.accounts || [],
              ballots: [],
              auditLogs: [],
            };
          }
        }
      }
    } catch {
      // fallback to disk
    }

    // 2. Fallback to local data/election-data.json if needed
    if (!electionPayload) {
      try {
        const dataFilePath = path.join(process.cwd(), 'data', 'election-data.json');
        if (fs.existsSync(dataFilePath)) {
          const fileContent = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
          electionPayload = fileContent.data || fileContent;
          if (fileContent.status && !electionStatus) {
            electionStatus = fileContent.status;
          }
        }
      } catch {
        // ignore
      }
    }

    // 3. Fallback to defaultData
    if (!electionPayload) {
      try {
        const { getDefaultElectionData } = require('../src/utils/defaultData');
        if (typeof getDefaultElectionData === 'function') {
          electionPayload = getDefaultElectionData();
        }
      } catch {
        // ignore
      }
    }

    if (req.method === 'POST') {
      return res.status(200).json({
        success: true,
        message: 'Election state acknowledged',
        data: req.body?.data || electionPayload,
        status: req.body?.status || electionStatus || 'Setup',
      });
    }

    return res.status(200).json({
      success: true,
      data: electionPayload,
      status: electionStatus || 'Setup',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      message: 'Default election state fallback',
      status: 'Setup',
      timestamp: new Date().toISOString(),
    });
  }
}
