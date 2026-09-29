export default function handler(req: any, res: any) {
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
