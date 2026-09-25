import { getDefaultElectionData } from '../../../src/utils/defaultData';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

/**
 * GET /api/election
 * Returns the current canonical election state and status.
 */
export async function GET(request: Request) {
  try {
    const defaultData = getDefaultElectionData();

    return Response.json(
      {
        success: true,
        data: defaultData,
        status: 'Open',
        source: 'nextjs-app-router',
        timestamp: new Date().toISOString(),
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
        error: error?.message || 'Failed to retrieve election state',
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    );
  }
}

/**
 * POST /api/election
 * Fallback to handle state updates if client posts directly to /api/election instead of /api/election/update
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    return Response.json(
      {
        success: true,
        message: 'Election state acknowledged',
        data: body.data,
        status: body.status || 'Open',
      },
      {
        status: 200,
        headers: CORS_HEADERS,
      }
    );
  } catch (error: any) {
    return Response.json(
      { success: false, error: error?.message || 'Invalid payload' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}

/**
 * OPTIONS /api/election
 * CORS preflight handling
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
