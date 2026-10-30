// Runs once when a server instance starts. In live production, refuse to run
// with settings missing that would otherwise fail quietly (e.g. no email key
// means nobody can verify their account).
const REQUIRED_IN_PRODUCTION = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "RESEND_API_KEY", "EMAIL_FROM"];

export function register() {
  if (process.env.VERCEL_ENV !== "production") return;
  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables in production: ${missing.join(", ")}`);
  }
}
