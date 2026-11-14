// Shared helpers for the Vercel functions. Files starting with "_" are not exposed as routes.
const env = k => (process.env[k] || '').trim();

function send(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
}

async function readJson(req, limit = 16 * 1024) {
    if (req.body && typeof req.body === 'object') return req.body;          // Vercel already parsed it
    if (typeof req.body === 'string') return JSON.parse(req.body);
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > limit) throw Object.assign(new Error('body too large'), { status: 413 }); }
    return raw ? JSON.parse(raw) : {};
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupiah = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');

// Verifies a Supabase access token by asking Supabase who it belongs to.
async function supabaseUser(token) {
    const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
    if (!url || !anon || !token) return null;
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id && u.email ? u : null;
}

module.exports = { env, send, readJson, escapeHtml, rupiah, supabaseUser };
