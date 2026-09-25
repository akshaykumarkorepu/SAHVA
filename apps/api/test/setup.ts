/**
 * Test environment.
 *
 * config/env.ts validates on import and calls process.exit(1) when anything is
 * missing, so these must be set before any module that imports it. Import this
 * file FIRST in any test that touches config, auth or the error handler —
 * ES modules evaluate in import order, so a bare `import "./setup.js"` at the
 * top does the job.
 */
process.env.NODE_ENV ??= "test";
process.env.LOG_LEVEL ??= "silent";
process.env.SUPABASE_URL ??= "http://127.0.0.1:59999";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key-000000000000000000";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-key-00000000000000";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-000000";
process.env.VOICE_API_KEY ??= "0123456789abcdef0123456789abcdef";
process.env.CORS_ORIGINS ??= "http://localhost:3000";

export {};
