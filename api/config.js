// GET /api/config: public, browser-safe settings. Only the anon key (protected by RLS) and the Sentry DSN.
const { env, send } = require('./_lib');

module.exports = (req, res) => {
    send(res, 200, {
        supabaseUrl: env('SUPABASE_URL') || null,
        supabaseAnonKey: env('SUPABASE_ANON_KEY') || null,
        sentryDsn: env('SENTRY_DSN') || null,
        environment: env('VERCEL_ENV') || 'development'
    });
};
