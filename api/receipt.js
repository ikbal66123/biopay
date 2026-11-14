// POST /api/receipt: emails a transaction receipt (via Resend) to the signed-in user's own address only.
// Requires: Authorization: Bearer <Supabase access token>. Env: SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY, RECEIPT_FROM.
const { env, send, readJson, escapeHtml, rupiah, supabaseUser } = require('./_lib');

const recent = new Map(); // best-effort rate limit per user (per warm instance)
const LIMIT = 10, WINDOW_MS = 10 * 60 * 1000;

module.exports = async (req, res) => {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method_not_allowed' }); }
    if (!env('RESEND_API_KEY') || !env('RECEIPT_FROM')) return send(res, 501, { error: 'email_not_configured' });

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseUser(token).catch(() => null);
    if (!user) return send(res, 401, { error: 'unauthorized' });

    const now = Date.now(), hits = (recent.get(user.id) || []).filter(t => now - t < WINDOW_MS);
    if (hits.length >= LIMIT) return send(res, 429, { error: 'too_many_requests' });
    hits.push(now); recent.set(user.id, hits);

    let body;
    try { body = await readJson(req); } catch (e) { return send(res, e.status || 400, { error: 'invalid_json' }); }
    const title = String(body.title || '').slice(0, 160).trim();
    const amount = Number(body.amount_idr);
    const direction = ['out', 'in', 'move'].includes(body.direction) ? body.direction : 'out';
    const when = body.occurred_at && !isNaN(Date.parse(body.occurred_at)) ? new Date(body.occurred_at) : new Date();
    const ref = String(body.reference || '').replace(/[^\w-]/g, '').slice(0, 40) || 'BP' + now.toString(36).toUpperCase();
    if (!title || !Number.isInteger(amount) || amount <= 0 || amount > 100000000000) return send(res, 400, { error: 'invalid_transaction' });

    const sign = direction === 'in' ? '+' : direction === 'out' ? '-' : '';
    const whenTxt = when.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0F1B2D">
        <h2 style="margin:0 0 4px">Struk BioPay</h2><p style="margin:0 0 16px;color:#566173">${escapeHtml(whenTxt)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px">
          <tr><td style="padding:6px 0;color:#566173">Transaksi</td><td style="text-align:right"><b>${escapeHtml(title)}</b></td></tr>
          <tr><td style="padding:6px 0;color:#566173">Nominal</td><td style="text-align:right"><b>${escapeHtml(sign + rupiah(amount))}</b></td></tr>
          ${body.wallet_label ? `<tr><td style="padding:6px 0;color:#566173">Sumber dana</td><td style="text-align:right">${escapeHtml(String(body.wallet_label).slice(0, 60))}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#566173">Referensi</td><td style="text-align:right">${escapeHtml(ref)}</td></tr>
        </table>
        <p style="margin-top:20px;font-size:12px;color:#6B7585">Bukan kamu? Kunci BioID di aplikasi BioPay: Pengaturan &gt; Pusat keamanan.</p></div>`;

    const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${user.id}-${ref}` },
        body: JSON.stringify({ from: env('RECEIPT_FROM'), to: [user.email], subject: `Struk BioPay: ${title} ${sign}${rupiah(amount)}`, html })
    }).catch(() => null);
    if (!r || !r.ok) return send(res, 502, { error: 'email_failed' });
    send(res, 202, { sent: true, reference: ref });
};
