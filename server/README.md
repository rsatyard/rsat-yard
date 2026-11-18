# RSAT Yard sign-in server (for IT)

This small Node.js server adds **company Microsoft sign-in** to RSAT Yard through the RSA SSO service (`auth.rsa.global`), and serves the yard website.

- `GET /auth/sso/initiate` redirects to `https://auth.rsa.global/sso/microsoft?callback=<APP_BASE_URL>/auth/sso-callback`.
- `GET /auth/sso-callback?identity_token=<JWT>` checks the token with `jose` against `https://auth.rsa.global/.well-known/jwks.json`. It accepts only RS256, requires issuer `auth.rsa.global`, and requires `exp`.
- The email in the token, in lower case, must match an **existing active** account in the yard's account list (Firestore `users` collection, managed by admins under **Accounts**). Signing in never creates an account.
  - No match: redirects to `/login?sso_error=no_account`.
  - Missing or bad token: redirects to `/login?sso_error=invalid_token`.
  - Server error: redirects to `/login?sso_error=server_error`.
- On success it sets an httpOnly session cookie `yard_session` (12 hours) and redirects to the dashboard `/`.
  - The cookie is signed (HMAC-SHA256) with `SESSION_SECRET`.
  - It is `Secure` when `APP_BASE_URL` is https. It is not secure on http://localhost.
  - `SameSite` is `Lax`.
- `GET /auth/firebase-token` lets a signed-in page swap its session for a Firebase sign-in token. The yard data stays in Firebase and its database rules keep checking every read and write.
- `POST /auth/logout` ends the session.
- **Public:** `/login`, `/auth/sso/initiate`, `/auth/sso-callback`, and the page's scripts and styles. **Session required:** `/`.
- **Android app:** sign-in starts with `/auth/sso/initiate?app=1`. After the callback, the app is sent back to its own page with a one-time Firebase token, so it needs no server session.

## What to host

- **Node.js 20 or newer**, for example Azure App Service (Linux, Node 20 LTS).
- Deploy the **whole repository**. The server reads the app files from `app/src/main/assets/www`.
- Start command:
  ```bash
  cd server && npm ci --omit=dev && npm start
  ```
- The server listens on `PORT` (default 8080).
- Put it behind HTTPS on its public address, for example `https://yard.rsa.global`.
- Ask the SSO team to allow the callback `https://<public address>/auth/sso-callback` if `auth.rsa.global` keeps an allow-list.

## Settings (environment variables)

| Name | Value |
| --- | --- |
| `SSO_HOST` | `auth.rsa.global` |
| `SSO_ISSUER` | `auth.rsa.global` |
| `APP_BASE_URL` | The public address, e.g. `https://yard.rsa.global` (no slash at the end) |
| `SESSION_SECRET` | A random value of at least 32 characters, e.g. from `openssl rand -base64 48`. Keep it secret. |
| `FIREBASE_SERVICE_ACCOUNT` | The Firebase service account key (JSON, or the JSON base64-encoded). The app owner downloads it from the Firebase console: **Project settings > Service accounts > Generate new private key** (project `rsat-yard-ceac2`). Hand it over securely and never put it in the repository. |
| `OWNER_EMAIL` | The owner's Microsoft email. On start, the server adds it as an active admin if it isn't in the account list yet, so the owner can always sign in. |
| `TRUST_PROXY` | Optional. Trusts one proxy by default (right for Azure App Service). Set `0` if nothing sits in front of the server. |

Set these in the host's settings for production, and in your shell for local testing. Some hosts keep development and deployment settings separately. **Restart or redeploy** after changing them.

## Test locally

PowerShell:

```powershell
cd server
npm ci
$env:SSO_HOST="auth.rsa.global"; $env:SSO_ISSUER="auth.rsa.global"; $env:APP_BASE_URL="http://localhost:8080"
$env:SESSION_SECRET="<random 32+ characters>"; $env:FIREBASE_SERVICE_ACCOUNT=Get-Content -Raw "<path to key>.json"
npm start
```

Request `http://localhost:8080/auth/sso/initiate`. The redirect address before the first `?` must be `https://auth.rsa.global/sso/microsoft`.

The same check applies on the live address after deployment.

## After it's live (app owner)

1. Ask the owner to sign in once on the live address.
2. In `app/src/main/assets/www/firebase-config.js`, set `window.SSO_URL` to the live address and upload it to GitHub.
   - The new phone app then shows only **Sign in with Microsoft**.
   - The old github.io website forwards people to the new address.
3. Once everyone has the new phone app, raise **Oldest app version allowed** under Accounts.
4. In the Firebase console, open **Authentication > Sign-in method** and turn off **Email/Password**. This removes password sign-in completely.
