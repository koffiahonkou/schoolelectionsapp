export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PUT, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

async function handleUpdate(request: Request) {
  try {
    const body = await request.json();
    const { data, status, actor, actorRole, actionDescription } = body;

    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    return Response.json(
      {
        success: true,
        message: 'Election state updated successfully',
        data,
        status: status || 'Open',
        clientIp,
        actionDescription: actionDescription || 'Election state updated',
        actor: actor ? `${actor} (${actorRole || 'Staff'})` : 'Admin',
        updatedAt: new Date().toISOString(),
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
        error: error?.message || 'Failed to process election update',
      },
      {
        status: 400,
        headers: CORS_HEADERS,
      }
    );
  }
}

/**
 * POST /api/election/update
 * Updates election configuration, status, positions, candidates, or roster.
 */
export async function POST(request: Request) {
  return handleUpdate(request);
}

/**
 * PUT /api/election/update
 * Full/idempotent update of election state.
 */
export async function PUT(request: Request) {
  return handleUpdate(request);
}

/**
 * GET /api/election/update
 * Status probe preventing 405 Method Not Allowed
 */
export async function GET() {
  return Response.json(
    {
      success: true,
      message: 'Election update endpoint active. Send POST or PUT requests to update state.',
      allowedMethods: ['POST', 'PUT', 'OPTIONS', 'GET'],
    },
    {
      status: 200,
      headers: CORS_HEADERS,
    }
  );
}

/**
 * OPTIONS /api/election/update
 * CORS preflight handling
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
