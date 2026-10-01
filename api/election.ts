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
        const { doc, getDoc, collection, getDocs, setDoc } = require('firebase/firestore');
        const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 4000));
        const snapPromise = getDoc(doc(db, 'election_metadata', 'current'));
        const snap = await Promise.race([snapPromise, timeoutPromise]);

        // Load disk data for fallback / comparison
        let diskData: any = null;
        let diskStatus = 'Open';
        try {
          const dataFilePath = path.join(process.cwd(), 'data', 'election-data.json');
          if (fs.existsSync(dataFilePath)) {
            const fileContent = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            diskData = fileContent.data || fileContent;
            diskStatus = fileContent.status || 'Open';
          }
        } catch {
          // ignore
        }

        // Fetch live votes from Firestore 'votes' collection
        const liveBallots: any[] = [];
        try {
          const votesSnap = await getDocs(collection(db, 'votes'));
          votesSnap.forEach((d: any) => {
            const b = d.data();
            liveBallots.push({
              id: b.id || d.id,
              choices: b.choices || {},
              submittedAt: b.submittedAt || new Date().toISOString(),
              isPractice: Boolean(b.isPractice),
              evidenceHash: b.evidenceHash || undefined,
            });
          });
        } catch (vErr) {
          console.warn('Could not fetch votes in api/election:', vErr);
        }

        // Fetch live tokens from Firestore 'voter_tokens' collection
        const tokenMap = new Map();
        try {
          const tokensSnap = await getDocs(collection(db, 'voter_tokens'));
          tokensSnap.forEach((d: any) => tokenMap.set(d.data().voterId?.toUpperCase(), d.data()));
        } catch (tErr) {
          console.warn('Could not fetch tokens in api/election:', tErr);
        }

        if (snap && snap.exists && snap.exists()) {
          const cloud = snap.data();
          const cloudHasPositions = Array.isArray(cloud.positions) && cloud.positions.length > 0;
          const isCloudBlankReset = !cloudHasPositions || cloud.config?.title === 'New Student Election';

          if (!isCloudBlankReset) {
            if (cloud.status) {
              electionStatus = cloud.status;
            } else if (cloud.config?.status) {
              electionStatus = cloud.config.status === 'Active' ? 'Open' : cloud.config.status;
            }

            let voters = (Array.isArray(cloud.voters) && cloud.voters.length > 0)
              ? cloud.voters
              : (diskData?.voters || []);
            voters = voters.map((v: any) => {
              const cleanId = v.voterId?.trim().toUpperCase();
              const t = tokenMap.get(cleanId);
              if (v.hasVoted || (t && (t.hasVoted || t.status === 'used'))) {
                return { ...v, hasVoted: true, votedAt: t?.votedAt || v.votedAt || new Date().toISOString() };
              }
              return v;
            });

            electionPayload = {
              config: cloud.config,
              positions: cloud.positions,
              candidates: cloud.candidates || [],
              voters,
              accounts: cloud.accounts || [],
              ballots: liveBallots.length > 0 ? liveBallots : (Array.isArray(cloud.ballots) && cloud.ballots.length > 0 ? cloud.ballots : (diskData?.ballots || [])),
              auditLogs: [],
            };
          } else if (diskData && Array.isArray(diskData.positions) && diskData.positions.length > 0) {
            // Heal Firestore: Cloud has blank/reset placeholder, restore canonical disk data
            console.log('[API] Healing blank Firestore election metadata with canonical disk election');
            electionStatus = diskStatus;
            let voters = diskData.voters || [];
            voters = voters.map((v: any) => {
              const t = tokenMap.get(v.voterId?.toUpperCase());
              if (t && (t.hasVoted || t.status === 'used')) {
                return { ...v, hasVoted: true, votedAt: t.votedAt || v.votedAt };
              }
              return v;
            });

            electionPayload = {
              config: diskData.config,
              positions: diskData.positions,
              candidates: diskData.candidates || [],
              voters,
              accounts: diskData.accounts || [],
              ballots: liveBallots.length > 0 ? liveBallots : (diskData.ballots || []),
              auditLogs: [],
            };

            // Non-blocking restore to Firestore
            setDoc(doc(db, 'election_metadata', 'current'), {
              status: electionStatus,
              config: electionPayload.config,
              positions: electionPayload.positions,
              candidates: electionPayload.candidates,
              voters: electionPayload.voters,
              accounts: electionPayload.accounts,
              totalEligibleVoters: electionPayload.voters.length,
              lastUpdated: new Date().toISOString(),
              updatedBy: 'Self-Healing Engine (DESAG-UCC)',
            }).catch(() => {});
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

    // Ensure ballots array is always defined
    if (electionPayload && !electionPayload.ballots) {
      electionPayload.ballots = [];
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
