import crypto from 'crypto';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function computeAuditHashNode(entry: any, previousHash: string): string {
  const canonicalString = [
    previousHash,
    entry.id,
    entry.timestamp,
    entry.eventType,
    entry.category,
    entry.actor || 'Unknown',
    entry.ipAddress || '127.0.0.1',
    (entry.details || '').trim(),
  ].join('|');

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'Audit log endpoint active. Send POST requests to append entries.',
    });
  }

  try {
    const body = req.body || {};
    const { eventType, details, category, actor, actorRole, metadata, previousHash = GENESIS_HASH } = body;

    const id = body.id || 'aud-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const timestamp = body.timestamp || new Date().toISOString();
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '127.0.0.1';

    const evidenceHash = computeAuditHashNode(
      {
        id,
        timestamp,
        eventType: eventType || 'audit_event',
        details: details || 'Administrative event logged.',
        category: category || 'admin',
        actor: actor || 'System User',
        ipAddress: clientIp,
      },
      previousHash
    );

    const fullEntry = {
      id,
      timestamp,
      eventType: eventType || 'audit_event',
      details: details || 'Administrative event logged.',
      category: category || 'admin',
      actor: actor || 'System User',
      actorRole: actorRole || 'Staff',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'] || 'Vercel Serverless Function',
      metadata: metadata || {},
      previousHash,
      evidenceHash,
    };

    return res.status(200).json({
      success: true,
      entry: fullEntry,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error?.message || 'Failed to append audit log entry',
    });
  }
}
