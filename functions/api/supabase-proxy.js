// Same-origin proxy for Supabase Auth, PostgREST, Storage and Functions.
// Restrict upstream paths to this project's supported API namespaces.
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const incoming = new URL(request.url);
  const path = incoming.searchParams.get('path') || '';
  const allowed = /^(auth\/v1|rest\/v1|storage\/v1|functions\/v1)(\/|$)/;
  if (!allowed.test(path) || path.includes('..') || path.startsWith('//')) {
    return Response.json({ error: 'Invalid Supabase API path' }, { status: 400 });
  }
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) return Response.json({ error: 'Supabase URL is not configured' }, { status: 503 });
  const target = base + '/' + path;
  try {
    const upstreamRequest = new Request(target, request);
    const upstream = await fetch(upstreamRequest);
    const headers = new Headers(upstream.headers);
    headers.delete('access-control-allow-origin');
    headers.delete('access-control-allow-credentials');
    headers.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  } catch (error) {
    return Response.json({ error: 'Supabase upstream request failed', detail: error?.message || 'Network error' }, { status: 502 });
  }
}
