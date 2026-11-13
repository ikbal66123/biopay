// BioPay end-to-end tests (Playwright, Chromium). Run: npm install && npx playwright install chromium && npm test
// The page is served locally; CDNs are blocked except the two QR libraries, which come from node_modules.
// MediaPipe models are blocked on purpose, so face/palm scans run in their labelled simulation mode.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const NM = p => require.resolve(p, { paths: [ROOT] });

const results = []; let page, errors = [];
async function test(name, fn) {
    errors = []; const t0 = Date.now();
    try { await fn(); if (errors.length) throw new Error('page errors: ' + errors.join(' | ')); results.push([name, true]); console.log(`  ok   ${name} (${Date.now() - t0} ms)`); }
    catch (e) { results.push([name, false]); console.log(`  FAIL ${name}\n       ${String(e.message || e).split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => assert(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const decodeCanvas = sel => page.evaluate(s => { const c = document.querySelector(s), d = c.getContext('2d').getImageData(0, 0, c.width, c.height); const r = jsQR(d.data, c.width, c.height); return r && r.data; }, sel);

(async () => {
    const server = http.createServer((req, res) => {
        const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
        if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}/index.html`;
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream=device-count=2'] });
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 }, permissions: ['camera'] });
    const requested = [];
    await ctx.route('**/*', r => {
        const u = r.request().url(); requested.push(u);
        if (u.startsWith('http://127.0.0.1')) return r.fallback();
        if (u.includes('qrcode-generator@1.4.4/qrcode.js')) return r.fulfill({ path: NM('qrcode-generator/qrcode.js'), contentType: 'application/javascript' });
        if (u.includes('jsqr@1.4.0/dist/jsQR.js')) return r.fulfill({ path: NM('jsqr/dist/jsQR.js'), contentType: 'application/javascript' });
        return r.abort();
    });
    // Fake microphone for the voice tests
    await ctx.addInitScript(() => {
        window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor() { window.__rec = this; } start() {} stop() {}
            emit(t) { this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] }); } };
    });
    page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForTimeout(400);
    await page.addScriptTag({ path: NM('jsqr/dist/jsQR.js') });
    console.log('BioPay e2e');

    await test('landing loads with inline CSS (no Tailwind CDN) and the customer quote', async () => {
        assert(!requested.some(u => u.includes('cdn.tailwindcss.com')), 'Tailwind CDN was requested');
        assert(await page.isVisible('#pt-quote'), 'quote not visible');
        eq(await page.locator('.pt-tabs [role="tab"]').count(), 4, 'device tabs');
    });

    await test('store checkout: Smart Route picks a wallet, payment earns points', async () => {
        await page.evaluate(() => { generateRandomPayment(); showScreen('screen-options'); });
        eq(await page.locator('#route-list .bp-route-opt').count(), 3, 'route options');
        assert((await page.textContent('#route-why')).length > 10, 'route reason missing');
        await page.click('#btn-confirm-payment');
        assert(/BioPoin/.test(await page.textContent('#success-reward')), 'no reward line');
    });

    await test('sign in with the demo account', async () => {
        await page.evaluate(() => { showScreen('screen-start'); openLogin(); });
        await page.fill('#login-id', 'ikbal@biopay.id'); await page.fill('#login-pass', 'biopay123');
        await page.evaluate(() => submitLogin());
        await page.waitForTimeout(300);
        assert(!(await page.textContent('#login-pass-err')), 'login error shown');
    });

    await test('Keuangan: payments are recorded automatically; assistant parses Indonesian amounts', async () => {
        await page.evaluate(() => { enterDashboard(); switchTab('keuangan'); });
        assert(/otomatis/.test(await page.locator('#fin-records li').first().innerText()), 'payment not auto-recorded');
        await page.fill('#ai-input', 'makan siang 35rb'); await page.press('#ai-input', 'Enter');
        assert(/Rp 35\.000 \(Makan & kopi\)/.test(await page.locator('#ai-log .bp-ai-msg:not(.me)').last().innerText()), 'expense not parsed');
        await page.fill('#ai-input', 'nabung liburan 200rb'); await page.press('#ai-input', 'Enter');
        assert(/Liburan Bali/.test(await page.locator('#ai-log .bp-ai-msg:not(.me)').last().innerText()), 'savings not handled');
    });

    await test('voice: wake word "BioPay" with amounts in words; other speech ignored', async () => {
        await page.click('#voice-btn');
        const last = () => page.locator('#ai-log .bp-ai-msg:not(.me)').last().innerText();
        await page.evaluate(() => window.__rec.emit('biopay parkir lima ribu'));
        assert(/Rp 5\.000 \(Transportasi\)/.test(await last()), 'voice command not recorded');
        const before = await page.locator('#ai-log .bp-ai-msg').count();
        await page.evaluate(() => window.__rec.emit('tadi makan siang'));
        eq(await page.locator('#ai-log .bp-ai-msg').count(), before, 'non-wake speech changed the chat');
        await page.click('#voice-btn');
    });

    await test('BioPay QR: scan reads QRIS, QR Saya is a real QR, QR Bayar refreshes', async () => {
        await page.evaluate(() => openQR('scan'));
        await page.evaluate(() => qrSimScan());
        eq(await page.textContent('#qr-to-name'), 'Warung Bu Sri', 'QRIS merchant name');
        await page.click('#qr-tab-mine');
        assert(/^BIOPAY:PAY\?/.test(await decodeCanvas('#qr-mine-canvas')), 'QR Saya not decodable');
        await page.click('#qr-tab-pay');
        const c1 = await page.textContent('#qr-pay-code');
        await page.locator('#qr-view-pay button', { hasText: 'Simulasikan kasir scan' }).click();
        assert(c1 !== await page.textContent('#qr-pay-code'), 'pay code not refreshed after use');
        await page.evaluate(() => closeScanQRModal());
    });

    for (const [dev, sfx, kit, balExpr] of [['kasku', '', 'MK2', 'ewalletBalance'], ['lintas', '-p3', 'MK3', 'TV.state.balance']]) {
        await test(`${dev}: QR Bayar is single-use and deducts the cashier's amount`, async () => {
            await page.evaluate(d => selectDevice(d), dev);
            await page.evaluate(`${kit}.showEwalletMinta()`);
            await page.click(`#kitqr-tab-pay${sfx}`);
            const c1 = await page.textContent(`#kitqr-pay-code${sfx}`);
            await page.locator(`#kitqr-view-pay${sfx} button`, { hasText: 'Buat QR Bayar baru' }).click();
            assert(c1 !== await page.textContent(`#kitqr-pay-code${sfx}`), 'new code not generated');
            assert(/^BIOPAY:CPM\?token=/.test(await decodeCanvas(`#kitqr-pay-canvas${sfx}`)), 'pay QR not decodable');
            const b0 = await page.evaluate(balExpr);
            await page.fill(`#kitqr-cashier-amount${sfx}`, '35000');
            await page.locator(`#kitqr-view-pay${sfx} button`, { hasText: 'Scan & tarik' }).click();
            eq(await page.evaluate(balExpr), b0 - 35000, 'balance after cashier');
            await page.fill(`#kitqr-cashier-amount${sfx}`, '10000');
            await page.locator(`#kitqr-view-pay${sfx} button`, { hasText: 'Scan & tarik' }).click();
            eq(await page.evaluate(balExpr), b0 - 35000, 'used code must be refused');
            await page.evaluate(`${kit}.closeKitQR()`);
        });
    }

    await test('cardless ATM: face + palm, then withdraw Rp 500.000', async () => {
        await page.click('#dev-tab-atm');
        await page.locator('#atm-device', { hasText: 'Mulai' }).locator('button', { hasText: 'Mulai' }).click();
        await page.waitForSelector('#atm-device .atm-src', { timeout: 30000 });
        await page.locator('#atm-device .atm-grid button', { hasText: 'Tarik tunai' }).click();
        await page.locator('#atm-device .atm-grid button', { hasText: 'Rp 500.000' }).click();
        await page.locator('#atm-device .atm-actions .bp-btn-primary').click();
        await page.locator('#atm-device button', { hasText: 'Uang sudah diambil' }).click();
        assert(/Rp 500\.000/.test(await page.locator('#atm-device .atm-rcpt').innerText()), 'no receipt');
        await page.click('#dev-tab-terminal');
    });

    await test('partner sandbox and guided tour', async () => {
        await page.click('#partners .pt-sb-row button'); await page.waitForTimeout(3200);
        eq(await page.locator('#sb-log li').count(), 6, 'sandbox log lines');
        await page.click('.pt-hero .pt-btn-primary');
        for (let i = 0; i < 6; i++) await page.click('#pt-tour-next');
        assert(await page.evaluate(() => document.getElementById('pt-tour').hidden), 'tour did not close');
    });

    await test('camera flip: every scan view can switch front / back camera', async () => {
        await page.click('#dev-tab-terminal');
        await page.evaluate(() => openQR('scan'));
        await page.waitForSelector('#modal-scan-qr .cam-flip', { timeout: 10000 });
        eq(await page.getAttribute('#video-qr', 'data-facing'), 'environment', 'QR starts on back camera');
        eq(await page.evaluate(() => getComputedStyle(document.getElementById('video-qr')).transform), 'none', 'back camera not mirrored');
        await page.click('#modal-scan-qr .cam-flip'); await page.waitForTimeout(400);
        eq(await page.getAttribute('#video-qr', 'data-facing'), 'user', 'flipped to front camera');
        assert(/matrix\(-1/.test(await page.evaluate(() => getComputedStyle(document.getElementById('video-qr')).transform)), 'front camera should be mirrored');
        assert(await page.evaluate(() => !!document.getElementById('video-qr').srcObject), 'no stream after flip');
        await page.evaluate(() => closeScanQRModal());
        assert(await page.evaluate(() => !document.getElementById('video-qr').srcObject), 'stream not released after close');
    });

    await test('phone width: no horizontal scroll', async () => {
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
        eq(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'scrollWidth');
    });

    await browser.close(); server.close();
    const failed = results.filter(r => !r[1]).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
