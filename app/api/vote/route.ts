export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { choices, isPractice } = body || {};

    if (!choices || typeof choices !== 'object') {
      return Response.json(
        { success: false, error: 'Invalid ballot choices payload.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const ballotId = 'bal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const submittedAt = new Date().toISOString();

    const ballot = {
      id: ballotId,
      submittedAt,
      isPractice: Boolean(isPractice),
      choices,
    };

    return Response.json(
      {
        success: true,
        ballotId,
        timestamp: submittedAt,
        ballot,
        message: 'Ballot verified and ready for Firestore synchronization',
      },
      {
        status: 200,
        headers: CORS_HEADERS,
      }
    );
  } catch (error: any) {
    return Response.json(
      { success: false, error: error?.message || 'Server error processing ballot' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
