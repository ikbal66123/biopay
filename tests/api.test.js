// Unit tests for the Vercel functions with a mocked fetch (no network, no keys).
const assert = require('assert');
const path = require('path');
const load = name => { const p = path.join(__dirname, '..', 'api', name); delete require.cache[require.resolve(p)]; delete require.cache[require.resolve(path.join(__dirname, '..', 'api', '_lib.js'))]; return require(p); };
const call = async (fn, { method = 'GET', headers = {}, body } = {}) => {
    const out = { headers: {} };
    const res = { statusCode: 200, setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; }, end: s => { out.body = JSON.parse(s); } };
    await fn({ method, headers, body }, res);
    return { status: res.statusCode, body: out.body, headers: out.headers };
};
const reset = () => { for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'RESEND_API_KEY', 'RECEIPT_FROM', 'SENTRY_DSN']) delete process.env[k]; };
let passed = 0; const t = async (name, f) => { reset(); try { await f(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };

(async () => {
    console.log('API unit tests');
    await t('health without config is ok and reveals no secrets', async () => {
        const r = await call(load('health.js'));
        assert.strictEqual(r.status, 200); assert.strictEqual(r.body.ok, true); assert.strictEqual(r.body.checks.supabase, 'not_configured');
    });
    await t('health reports Supabase down as 503', async () => {
        process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
        global.fetch = async () => ({ ok: false, status: 500 });
        const r = await call(load('health.js')); assert.strictEqual(r.status, 503); assert.strictEqual(r.body.ok, false);
    });
    await t('config exposes only public values', async () => {
        process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon'; process.env.RESEND_API_KEY = 'secret';
        const r = await call(load('config.js'));
        assert.strictEqual(r.body.supabaseAnonKey, 'anon'); assert.ok(!JSON.stringify(r.body).includes('secret'));
    });
    await t('receipt rejects GET, missing email config, and bad tokens', async () => {
        assert.strictEqual((await call(load('receipt.js'))).status, 405);
        assert.strictEqual((await call(load('receipt.js'), { method: 'POST' })).status, 501);
        Object.assign(process.env, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 're_x', RECEIPT_FROM: 'BioPay <struk@biopay.id>' });
        global.fetch = async () => ({ ok: false, status: 401 });
        assert.strictEqual((await call(load('receipt.js'), { method: 'POST', headers: { authorization: 'Bearer bad' }, body: {} })).status, 401);
    });
    await t('receipt emails only the signed-in user, escapes HTML, validates amount', async () => {
        Object.assign(process.env, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 're_x', RECEIPT_FROM: 'BioPay <struk@biopay.id>' });
        const sent = [];
        global.fetch = async (url, opt) => {
            if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'ayu@test.id' }) };
            sent.push(JSON.parse(opt.body)); return { ok: true, json: async () => ({ id: 'e1' }) };
        };
        const fn = load('receipt.js');
        const bad = await call(fn, { method: 'POST', headers: { authorization: 'Bearer good' }, body: { title: 'x', amount_idr: -5 } });
        assert.strictEqual(bad.status, 400);
        const r = await call(fn, { method: 'POST', headers: { authorization: 'Bearer good' }, body: { title: '<script>Kopi</script>', amount_idr: 28000, to: 'attacker@evil.test' } });
        assert.strictEqual(r.status, 202);
        assert.deepStrictEqual(sent[0].to, ['ayu@test.id']);
        assert.ok(!sent[0].html.includes('<script>') && sent[0].html.includes('&lt;script&gt;'));
        assert.ok(sent[0].html.includes('Rp 28.000'));
    });
    console.log(`${passed} passed`);
})();
