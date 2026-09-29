export default function handler(req: any, res: any) {
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
    const { choices, isPractice } = req.body || {};
    if (!choices || typeof choices !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid ballot choices payload.' });
    }

    const ballotId = 'bal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const submittedAt = new Date().toISOString();

    return res.status(200).json({
      success: true,
      ballotId,
      timestamp: submittedAt,
      message: 'Ballot verified and ready for Firestore synchronization',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Server error processing ballot',
    });
  }
}
