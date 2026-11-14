// GET /api/health: for UptimeRobot (keyword monitor on "ok":true). Never exposes secrets.
const { env, send } = require('./_lib');

module.exports = async (req, res) => {
    const checks = { supabase: 'not_configured', email: env('RESEND_API_KEY') ? 'configured' : 'not_configured', errors: env('SENTRY_DSN') ? 'configured' : 'not_configured' };
    let ok = true;
    if (env('SUPABASE_URL') && env('SUPABASE_ANON_KEY')) {
        try {
            const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
            const r = await fetch(`${env('SUPABASE_URL')}/auth/v1/health`, { headers: { apikey: env('SUPABASE_ANON_KEY') }, signal: ctrl.signal });
            clearTimeout(t);
            checks.supabase = r.ok ? 'up' : `down (${r.status})`; ok = ok && r.ok;
        } catch (e) { checks.supabase = 'down (unreachable)'; ok = false; }
    }
    send(res, ok ? 200 : 503, { ok, service: 'biopay', version: (env('VERCEL_GIT_COMMIT_SHA') || 'local').slice(0, 7), time: new Date().toISOString(), checks });
};
