import { getDefaultElectionData } from '../src/utils/defaultData';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const defaultData = getDefaultElectionData();

  if (req.method === 'POST') {
    return res.status(200).json({
      success: true,
      message: 'Election state acknowledged',
      data: req.body?.data || defaultData,
      status: req.body?.status || 'Open',
    });
  }

  return res.status(200).json({
    success: true,
    data: defaultData,
    status: 'Open',
    timestamp: new Date().toISOString(),
  });
}
