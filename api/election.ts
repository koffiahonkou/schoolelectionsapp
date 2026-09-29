import fs from 'fs';
import path from 'path';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    let electionPayload: any = null;
    let electionStatus = 'Open';

    // 1. Load actual election configuration from data/election-data.json if packaged
    try {
      const dataFilePath = path.join(process.cwd(), 'data', 'election-data.json');
      if (fs.existsSync(dataFilePath)) {
        const fileContent = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        electionPayload = fileContent.data || fileContent;
        if (fileContent.status) {
          electionStatus = fileContent.status;
        }
      }
    } catch {
      // ignore
    }

    // 2. Fallback to src/utils/defaultData
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
        status: req.body?.status || electionStatus,
      });
    }

    return res.status(200).json({
      success: true,
      data: electionPayload,
      status: electionStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      message: 'Default election state fallback',
      status: 'Open',
      timestamp: new Date().toISOString(),
    });
  }
}
