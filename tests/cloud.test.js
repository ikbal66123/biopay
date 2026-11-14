// End-to-end test of the cloud layer against a simulated Supabase + Vercel API (no real keys or network).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const NM = p => require.resolve(p, { paths: [ROOT] });
const assert = (c, m) => { if (!c) throw new Error(m); };

(async () => {
    const server = http.createServer((req, res) => {
        const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(f).pipe(res);
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 950 } })).newPage();
    const errors = [], seen = { tx: [], receipt: [], logout: 0, login: 0 };
    page.on('pageerror', e => errors.push(e.message));
    const user = { id: '11111111-2222-3333-4444-555555555555', email: 'sari@contoh.id', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Sari Wulandari' } };
    const sessionBody = () => JSON.stringify({ access_token: 'tok-sari', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user });
    await page.route('**/*', async r => {
        const u = r.request().url(), m = r.request().method();
        if (u.startsWith(base + '/api/config')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ supabaseUrl: 'https://demo.supabase.co', supabaseAnonKey: 'anon-key', sentryDsn: null, environment: 'test' }) });
        if (u.startsWith(base + '/api/receipt')) { seen.receipt.push({ auth: r.request().headers().authorization, body: JSON.parse(r.request().postData()) }); return r.fulfill({ status: 202, contentType: 'application/json', body: '{"sent":true}' }); }
        if (u.startsWith(base)) return r.fallback();
        if (u.includes('@supabase/supabase-js@2.45.4/dist/umd/supabase.js')) return r.fulfill({ path: NM('@supabase/supabase-js/dist/umd/supabase.js'), contentType: 'application/javascript' });
        if (u.startsWith('https://demo.supabase.co/')) {
            const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
            if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
            if (u.includes('/auth/v1/token')) { seen.login++; const b = JSON.parse(r.request().postData()); return b.password === 'rahasia123' ? r.fulfill({ headers: cors, contentType: 'application/json', body: sessionBody() }) : r.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: '{"error":"invalid_grant","error_description":"Invalid login credentials"}' }); }
            if (u.includes('/rest/v1/profiles')) return r.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify([{ full_name: 'Sari Wulandari', phone_e164: '+6281298765432', country_code: 'ID', bio_id: '48213' }]) });
            if (u.includes('/rest/v1/transactions') && m === 'POST') { seen.tx.push({ auth: r.request().headers().authorization, row: JSON.parse(r.request().postData()) }); return r.fulfill({ status: 201, headers: cors, body: '' }); }
            if (u.includes('/auth/v1/logout')) { seen.logout++; return r.fulfill({ status: 204, headers: cors }); }
            return r.fulfill({ status: 404, headers: cors, body: '{}' });
        }
        if (u.includes('qrcode-generator')) return r.fulfill({ path: NM('qrcode-generator/qrcode.js'), contentType: 'application/javascript' });
        return r.abort();
    });
    let failed = 0; const t = async (name, f) => { try { await f(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n      ', e.message); } };
    console.log('Cloud layer (simulated Supabase)');
    await page.goto(base + '/index.html');
    await t('connects when /api/config has keys', async () => {
        await page.waitForFunction(() => document.getElementById('cloud-status').dataset.mode === 'cloud', null, { timeout: 8000 });
    });
    await t('signs in a server account on a new device and mirrors it locally', async () => {
        await page.evaluate(() => openLogin());
        await page.fill('#login-id', 'sari@contoh.id'); await page.fill('#login-pass', 'rahasia123');
        await page.evaluate(() => submitLogin());
        await page.waitForFunction(() => document.getElementById('screen-dashboard').classList.contains('active'), null, { timeout: 8000 });
        assert(/Sari Wulandari/.test(await page.textContent('#txt-user-name')), 'name from server profile');
    });
    await t('a payment is written to transactions with the user token, and a receipt is emailed', async () => {
        await page.evaluate(() => { generateRandomPayment(); showScreen('screen-options'); });
        await page.click('#btn-confirm-payment'); await page.waitForTimeout(800);
        const tx = seen.tx.find(x => x.row.channel === 'terminal');
        assert(tx, 'no terminal transaction sent');
        assert(tx.auth === 'Bearer tok-sari' && tx.row.user_id === user.id && tx.row.amount_idr > 0, 'bad transaction row');
        assert(seen.receipt.length === 1 && seen.receipt[0].auth === 'Bearer tok-sari', 'receipt not requested with token');
    });
    await t('a voice note is stored with channel "voice"', async () => {
        await page.evaluate(() => { enterDashboard(); switchTab('keuangan'); simulateVoice('BioPay, kopi dua ribu'); });
        await page.waitForTimeout(500);
        assert(seen.tx.some(x => x.row.channel === 'voice' && x.row.amount_idr === 2000), 'voice tx missing');
    });
    await t('wrong password stays rejected', async () => {
        await page.evaluate(() => { logout(); openLogin(); });
        await page.fill('#login-id', 'orang@lain.id'); await page.fill('#login-pass', 'salah');
        await page.evaluate(() => submitLogin()); await page.waitForTimeout(500);
        assert(/salah/.test(await page.textContent('#login-pass-err')), 'no error for wrong password');
        assert(seen.logout >= 1, 'logout did not reach the server');
    });
    await t('no page errors', async () => { assert(!errors.length, errors.join(' | ')); });
    await browser.close(); server.close();
    console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
