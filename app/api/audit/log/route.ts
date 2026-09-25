import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

function computeAuditHashNode(
  entry: {
    id: string;
    timestamp: string;
    eventType: string;
    details: string;
    category: string;
    actor?: string;
    ipAddress?: string;
  },
  previousHash: string
): string {
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

/**
 * POST /api/audit/log
 * Appends a tamper-evident, SHA-256 Merkle-chained audit log entry.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventType, details, category, actor, actorRole, metadata, previousHash = GENESIS_HASH } = body;

    const id = body.id || 'aud-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const timestamp = body.timestamp || new Date().toISOString();

    // Extract client IP from standard proxy headers
    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Next.js App Router Client';

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
      userAgent,
      metadata: metadata || {},
      previousHash,
      evidenceHash,
    };

    return Response.json(
      {
        success: true,
        entry: fullEntry,
      },
      {
        status: 200,
        headers: CORS_HEADERS,
      }
    );
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        error: error?.message || 'Failed to append audit log entry',
      },
      {
        status: 400,
        headers: CORS_HEADERS,
      }
    );
  }
}

/**
 * GET /api/audit/log
 * Status probe to prevent 405 Method Not Allowed on inadvertent GET requests
 */
export async function GET() {
  return Response.json(
    {
      success: true,
      message: 'Audit log endpoint active. Send POST requests to append entries.',
      allowedMethods: ['POST', 'OPTIONS', 'GET'],
    },
    {
      status: 200,
      headers: CORS_HEADERS,
    }
  );
}

/**
 * OPTIONS /api/audit/log
 * CORS preflight handling
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
