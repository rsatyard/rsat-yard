// RSAT Yard sign-in server.
// Staff sign in with their company Microsoft account through the RSA SSO service (auth.rsa.global).
// The server checks the SSO token, matches the email to an active yard account, then starts a session.
// It also serves the yard web app itself. Settings come from environment variables (see README.md).
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { openStore } from "./store.js";

const env = process.env;
function setting(name) {
  const v = String(env[name] || "").trim();
  if (!v) { console.error(`Missing setting ${name}. See server/README.md.`); process.exit(1); }
  return v;
}
const SSO_HOST = setting("SSO_HOST").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const SSO_ISSUER = setting("SSO_ISSUER");
const APP_BASE_URL = setting("APP_BASE_URL").replace(/\/+$/, "");
const SESSION_SECRET = setting("SESSION_SECRET");
if (SESSION_SECRET.length < 32) { console.error("SESSION_SECRET must be at least 32 characters."); process.exit(1); }
const PORT = Number(env.PORT) || 8080;

// Plain http only for a test SSO on this computer; the real one is always https.
const SSO_ORIGIN = (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(SSO_HOST) ? "http://" : "https://") + SSO_HOST;
const ISSUERS = [...new Set([SSO_ISSUER, SSO_ISSUER.replace(/^https?:\/\//, ""), "https://" + SSO_ISSUER.replace(/^https?:\/\//, "")])];
const JWKS = createRemoteJWKSet(new URL(SSO_ORIGIN + "/.well-known/jwks.json"));
const SECURE = APP_BASE_URL.startsWith("https://");       // not secure on http://localhost, so local testing works
const SESSION_HOURS = 12;
const SESSION_COOKIE = "yard_session";
const APP_COOKIE = "yard_sso_app";                          // remembers that the sign-in started in the Android app
const ANDROID_APP = "https://appassets.androidplatform.net/assets/www/index.html";
const here = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.resolve(env.WWW_DIR || path.join(here, "..", "app", "src", "main", "assets", "www"));
const cookieBase = { httpOnly: true, secure: SECURE, sameSite: "lax", path: "/" };

const store = await openStore(env);
if (env.OWNER_EMAIL) {
  const owner = env.OWNER_EMAIL.trim().toLowerCase();
  try { console.log(`Owner ${owner}: ${await store.ensureOwner(owner, env.OWNER_NAME)}`); }
  catch (err) { console.error("Couldn't check the owner account:", err.message); }
}

// ---- Session cookie: "<data>.<signature>", signed with SESSION_SECRET. ----
const sign = v => crypto.createHmac("sha256", SESSION_SECRET).update(v).digest("base64url");
function newSession(email) {
  const v = Buffer.from(JSON.stringify({ e: email, x: Date.now() + SESSION_HOURS * 3600e3 })).toString("base64url");
  return v + "." + sign(v);
}
function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip a bad cookie */ }
  }
  return out;
}
function sessionEmail(req) {
  const [v, s] = String(readCookies(req)[SESSION_COOKIE] || "").split(".");
  if (!v || !s) return null;
  const a = Buffer.from(s), b = Buffer.from(sign(v));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(v, "base64url").toString("utf8"));
    return typeof d.e === "string" && d.x > Date.now() ? d.e : null;
  } catch { return null; }
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY === "0" ? false : 1);   // Azure App Service and most hosts sit behind one proxy
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" });
  next();
});

// ---- Public: start the Microsoft sign-in. ----
app.get("/auth/sso/initiate", (req, res) => {
  if (req.query.app === "1") res.cookie(APP_COOKIE, "1", { ...cookieBase, maxAge: 15 * 60e3 });
  else res.clearCookie(APP_COOKIE, cookieBase);
  res.set("Cache-Control", "no-store");
  const callback = `${APP_BASE_URL}/auth/sso-callback`;
  res.redirect(302, `${SSO_ORIGIN}/sso/microsoft?callback=${encodeURIComponent(callback)}`);
});

// ---- Public: the SSO service sends the person back here with ?identity_token=<JWT>. ----
app.get("/auth/sso-callback", async (req, res) => {
  const fromApp = readCookies(req)[APP_COOKIE] === "1";
  res.clearCookie(APP_COOKIE, cookieBase);
  res.set("Cache-Control", "no-store");
  const fail = code => res.redirect(302, fromApp ? `${ANDROID_APP}?sso_error=${code}` : `/login?sso_error=${code}`);

  const token = typeof req.query.identity_token === "string" ? req.query.identity_token : "";
  if (!token) return fail("invalid_token");
  let email;
  try {
    const { payload } = await jwtVerify(token, JWKS, { algorithms: ["RS256"], issuer: ISSUERS, requiredClaims: ["exp"] });
    email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  } catch (err) {
    console.warn("SSO token refused:", err.code || err.message);
    return fail("invalid_token");
  }
  if (!email) return fail("invalid_token");

  try {
    if (!(await store.findActiveUser(email))) { console.warn(`Sign-in refused, no active account: ${email}`); return fail("no_account"); }
    if (fromApp) {
      // The Android app keeps its own Firebase sign-in, so it gets a one-time token in the address #fragment.
      return res.redirect(302, `${ANDROID_APP}#sso_token=${encodeURIComponent(await store.firebaseToken(email))}`);
    }
  } catch (err) {
    console.error("Account check failed:", err.message);
    return fail("server_error");
  }
  res.cookie(SESSION_COOKIE, newSession(email), { ...cookieBase, maxAge: SESSION_HOURS * 3600e3 });
  console.log(`Signed in: ${email}`);
  res.redirect(302, "/");
});

// ---- Signed-in page asks for a Firebase sign-in token (the database rules check its email). ----
app.get("/auth/firebase-token", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const email = sessionEmail(req);
  if (!email) return res.status(401).json({ error: "signed_out" });
  try {
    if (!(await store.findActiveUser(email))) {
      res.clearCookie(SESSION_COOKIE, cookieBase);
      return res.status(403).json({ error: "no_account" });
    }
    res.json({ email, token: await store.firebaseToken(email) });
  } catch (err) {
    console.error("Firebase token failed:", err.message);
    res.status(503).json({ error: "server_error" });
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieBase);
  res.redirect(303, "/login");
});

// ---- Pages. The login page is public; the app itself needs a session. ----
function sendApp(res) {
  res.set("Cache-Control", "no-store");
  res.type("html").send(fs.readFileSync(path.join(WWW, "index.html")));
}
app.get("/login", (req, res) => (sessionEmail(req) ? res.redirect(302, "/") : sendApp(res)));
app.get(["/", "/index.html"], (req, res) => (sessionEmail(req) ? sendApp(res) : res.redirect(302, "/login")));
// The app's settings file, plus the sign-in address so the page shows only the Microsoft button.
app.get("/firebase-config.js", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("js").send(fs.readFileSync(path.join(WWW, "firebase-config.js"), "utf8") + `\nwindow.SSO_URL = ${JSON.stringify(APP_BASE_URL)};\n`);
});
// Scripts, styles and icons the pages load. They hold no yard data.
app.use(express.static(WWW, { index: false, dotfiles: "ignore", redirect: false }));
app.use((req, res) => res.status(404).type("text").send("Not found"));

app.listen(PORT, () => console.log(`RSAT Yard sign-in server on port ${PORT}, public address ${APP_BASE_URL}`));
