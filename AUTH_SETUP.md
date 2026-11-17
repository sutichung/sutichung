# Secure login setup

The dashboard now requires a server-authenticated session before any market API route can be used.

## Required Render environment variables

Set these on the Render service **taiwan-stock-hunter-o3tt** (Dashboard → Environment):

- `ADMIN_USERNAME`: choose a private administrator username.
- `ADMIN_PASSWORD`: choose a unique password with at least 12 characters; use 16+ characters and a password manager.
- `SESSION_SECRET`: generate a random secret with at least 32 characters, for example `openssl rand -hex 32`.

Do not commit these values, put them in frontend build variables, or send them in chat. Use Render's secret environment variable fields.

After setting all three values, redeploy the service. If any are missing or the password is shorter than 12 characters or the session secret shorter than 32 characters, login remains disabled and protected API requests are rejected.

## Security behavior

- Password verification uses Node.js scrypt and constant-time comparisons; no plaintext password is stored in the source code.
- The session cookie is `HttpOnly; Secure; SameSite=Strict; Path=/` and expires after 12 hours.
- Login attempts are limited to 8 per IP per 15 minutes.
- Logout invalidates the server-side session.
- All `/api/*` routes except health and authentication status/login/logout require a valid session.
- No public registration or password-reset endpoint is exposed.

## Deployment note

Sessions are held in the service's in-memory store. A service restart invalidates all active sessions, and this design is intended for the current single-instance Render service. If the service is later scaled to multiple instances, move sessions and login throttling to a shared persistent store before scaling.
