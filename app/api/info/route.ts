export const runtime = 'nodejs';
export async function GET() {
  return new Response(JSON.stringify({
    ok: true,
    url: process.env.VERCEL_URL,
    env: process.env.NODE_ENV,
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null
  }), { headers: { 'content-type': 'application/json' }});
}