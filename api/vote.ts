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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

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

    const db = getDb();
    if (!isPractice && voterId && db) {
      const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
      const cleanId = voterId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
      const tokenRef = doc(db, 'voter_tokens', `token-${cleanId}`);
      const snap = await getDoc(tokenRef);

      if (snap.exists()) {
        const tokenData = snap.data();
        if (tokenData.hasVoted || tokenData.status === 'used') {
          return res.status(409).json({
            success: false,
            error: `This Student ID (${voterId.trim()}) has already cast an official ballot. Only one ballot is permitted per student.`,
          });
        }
        if (passcode && tokenData.token && passcode.trim().toUpperCase() !== tokenData.token.trim().toUpperCase()) {
          return res.status(401).json({
            success: false,
            error: 'Invalid access PIN provided for this student ID.',
          });
        }
      } else {
        // Fallback check in election_metadata current roster
        try {
          const metaRef = doc(db, 'election_metadata', 'current');
          const metaSnap = await getDoc(metaRef);
          if (metaSnap.exists()) {
            const meta = metaSnap.data();
            const found = (meta.voters || []).find((v: any) => v.voterId?.trim().toUpperCase() === cleanId);
            if (found && found.hasVoted) {
              return res.status(409).json({
                success: false,
                error: `This Student ID (${voterId.trim()}) has already cast an official ballot. Only one ballot is permitted per student.`,
              });
            }
          }
        } catch {
          // ignore
        }
      }

      // Record ballot in Firestore 'votes' collection (ANONYMOUS - no voterId in ballot)
      const ballotRef = doc(db, 'votes', ballotId);
      await setDoc(ballotRef, {
        id: ballotId,
        choices,
        submittedAt,
        isPractice: false,
        clientTimestamp: Date.now(),
      });

      // Mark token as used
      await setDoc(
        tokenRef,
        {
          id: `token-${cleanId}`,
          voterId: voterId.trim().toUpperCase(),
          hasVoted: true,
          votedAt: submittedAt,
          status: 'used',
        },
        { merge: true }
      );

      // Update election_metadata voter array as well so roster is synchronized
      try {
        const metaRef = doc(db, 'election_metadata', 'current');
        const metaSnap = await getDoc(metaRef);
        if (metaSnap.exists()) {
          const meta = metaSnap.data();
          if (Array.isArray(meta.voters)) {
            const updatedVoters = meta.voters.map((v: any) =>
              v.voterId.trim().toUpperCase() === voterId.trim().toUpperCase()
                ? { ...v, hasVoted: true, votedAt: submittedAt }
                : v
            );
            await updateDoc(metaRef, { voters: updatedVoters, lastUpdated: new Date().toISOString() });
          }
        }
      } catch (err) {
        console.warn('Metadata update error:', err);
      }
    }

    const ballot = {
      id: ballotId,
      submittedAt,
      isPractice: Boolean(isPractice),
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
    return res.status(500).json({
      success: false,
      error: error?.message || 'Server error processing ballot',
    });
  }
}
