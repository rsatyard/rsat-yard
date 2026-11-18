// Where the server looks up yard accounts and gets a Firebase sign-in for them.
// Production: the Firestore "users" collection (the same list admins manage under Accounts).
import fs from "node:fs";

export async function openStore(env) {
  if (env.TEST_USERS_FILE) {
    if (env.NODE_ENV === "production") throw new Error("TEST_USERS_FILE is for local testing only. Remove it in production.");
    return testStore(env.TEST_USERS_FILE);
  }
  const admin = (await import("firebase-admin")).default;
  let credential;
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    // The service account key file's contents: plain JSON, or the same JSON base64-encoded.
    const raw = env.FIREBASE_SERVICE_ACCOUNT.trim();
    credential = admin.credential.cert(JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")));
  } else {
    credential = admin.credential.applicationDefault();
  }
  admin.initializeApp({ credential });
  const db = admin.firestore();
  const auth = admin.auth();

  return {
    // Signing in never creates a yard account: only an existing, active one matches.
    async findActiveUser(email) {
      const snap = await db.collection("users").doc(email).get();
      const d = snap.exists ? snap.data() : null;
      return d && d.status === "active" ? d : null;
    },
    // A one-time token the app swaps for a Firebase sign-in (the database rules check that sign-in's email).
    async firebaseToken(email) {
      let user;
      try {
        user = await auth.getUserByEmail(email);
      } catch (err) {
        if (err.code !== "auth/user-not-found") throw err;
        user = await auth.createUser({ email, emailVerified: true });
      }
      return auth.createCustomToken(user.uid);
    },
    // Makes sure the owner can sign in: adds them as an active admin if they aren't in the list at all.
    async ensureOwner(email, name) {
      const ref = db.collection("users").doc(email);
      const snap = await ref.get();
      if (!snap.exists) {
        const now = new Date().toISOString();
        await ref.set({ email, name: name || email.split("@")[0], role: "admin", status: "active", createdAt: now, updatedAt: now, updatedBy: "sign-in server" });
        return "added";
      }
      const d = snap.data();
      return d.status === "active" && d.role === "admin" ? "ok" : `exists as ${d.role}, ${d.status}`;
    },
  };
}

// Local testing only: accounts come from a JSON file, e.g. { "a@b.com": { "role": "admin", "status": "active" } }.
function testStore(file) {
  const read = () => JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    async findActiveUser(email) { const d = read()[email]; return d && d.status === "active" ? d : null; },
    async firebaseToken(email) { return "TEST-TOKEN-FOR-" + email; },
    async ensureOwner(email) { const d = read()[email]; return !d ? "missing (test file)" : d.status === "active" && d.role === "admin" ? "ok" : "not an active admin"; },
  };
}
