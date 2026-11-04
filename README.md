# RSAT Yard: Android app + office website

One app, two ways to open it:

- **Android app (APK)** for yard staff: scan slot labels with the camera, record tanks, set status (Loaded / Empty clean / Empty dirty), move tanks and gate them out. Keeps working with weak signal and syncs when the connection is back.
- **Website** for the office: the same live yard map and register in any browser, plus **Export to Excel / CSV**.

Both read and write the same database (Firebase), so a tank recorded on a phone shows up on the website right away. Everyone signs in with an email and password that you create.

Setup takes about 30 minutes, once. You need two free accounts: **Firebase** (Google) and **GitHub**.

---

## Step 1: Create the database (Firebase)

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. **Create a project**, e.g. `rsat-yard`. Google Analytics is not needed.
3. On the project home page, click the **Web** icon (`</>`) to add a web app. Name it `RSAT Yard`. Don't tick Firebase Hosting.
4. Firebase shows a `firebaseConfig` block. Copy its values into **`app/src/main/assets/www/firebase-config.js`**, replacing every `PASTE_...` value.

## Step 2: Turn on sign-in and add your staff

1. In the Firebase console, open **Build > Authentication > Get started**.
2. Under **Sign-in method**, enable **Email/Password** and save.
3. Under **Users**, click **Add user** for each person (yard staff and office). Give each one their email and a password.
   - To remove someone's access later, disable or delete their user here.
4. Under **Settings > User actions**, untick **Enable create (sign-up)** and save, so only the accounts you add can sign in.

## Step 3: Create the tank database and lock it down

1. Open **Build > Firestore Database > Create database**.
2. Pick the location closest to your yard and choose **Start in production mode**.
3. Open the **Rules** tab, replace everything with the contents of **`firestore.rules`** from this folder, and click **Publish**.
   This allows only signed-in staff to see or change tank records.

## Step 4: Build the app and website (GitHub)

1. Create a free account at <https://github.com> if you don't have one.
2. Click **New repository**. Name it `rsat-yard` and make it **Public** (free GitHub Pages hosting needs a public repository; your tank data stays private behind sign-in).
3. On the new repository page, click **uploading an existing file**. Drag **everything inside this `rsat-yard-android` folder** into the page, including the `.github` folder, and click **Commit changes**.
   - If the `.github` folder doesn't upload, click **Add file > Create new file**, type `.github/workflows/build.yml` as the name, paste the contents of that file, and commit.
4. Open **Settings > Pages**. Under **Build and deployment > Source**, choose **GitHub Actions**.
5. Open the **Actions** tab. The **Build app and website** run starts on its own (if it started before step 4 finished, click it and choose **Re-run all jobs**). It takes about 5 minutes. A green tick means it worked.

When it's done:

- **Website:** `https://<your-github-name>.github.io/rsat-yard/`
- **APK download:** `https://github.com/<your-github-name>/rsat-yard/releases/latest/download/RSAT-Yard.apk`

Optional: put the APK download link in `window.APK_URL` in `firebase-config.js` and upload that file again. The website's sign-in page then shows a **Download the Android app** link.

## Step 5: Install on Android phones

1. On the phone, open the APK download link above in Chrome.
2. Tap the downloaded file. If Android asks, allow **Install unknown apps** for Chrome.
3. Open **RSAT Yard**, sign in, and allow camera access the first time you tap **Scan with camera**.

The phone must be online for the first sign-in. After that the app opens and records tanks offline, and syncs when it's back online.

## Daily use

- **Scan with camera** (or tap a slot on the map): shows the tank in that slot. Free slot: enter the tank number (or scan its barcode), pick the status, save.
- **Change status** with one tap. **Move** a tank to another slot. **Gate out** when it leaves (tap twice to confirm).
- Scan or type a **tank number** to find where it is.
- Each slot holds up to **5 tanks** (A11, B11, C11, M15, N15 and O15 hold 4; change `SMALL_SLOTS` in `index.html` to adjust). Record the **customer** when parking a tank; edit it later from the tank's card.
- **Export to Excel** (website or app): one row per tank visit with **Tank number, Customer, Status, Date in, Date out** by default. Filter by customer, status, date-in range, and in-yard / gated-out; switch on extra columns (days in yard, slot, zone, note, updated by) and an optional History sheet. Settings are remembered on each device. On the phone, exports open the share menu so you can save to Drive, email or WhatsApp.
- **Print slot labels**: makes a PDF of QR + barcode labels, 10 per A4 page.

## Making changes later

Edit the files and upload them to the GitHub repository again. Every upload rebuilds the website and a new APK.

**Updating the phone app:** cloud builds are signed with a temporary key. To install a new APK, first **uninstall** the old RSAT Yard app, then install the new one. No tank data is lost, because the data lives in Firebase, not on the phone. To update without uninstalling, add a fixed signing key as GitHub secrets (`SIGNING_KEYSTORE_BASE64`, `SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS`, `SIGNING_KEY_PASSWORD`); the build uses it automatically.

## What's in this folder

| Path | What it is |
| --- | --- |
| `app/src/main/assets/www/index.html` | The app itself (used by both the APK and the website) |
| `app/src/main/assets/www/firebase-config.js` | Your Firebase settings (step 1) |
| `app/src/main/assets/www/lib/` | Scanner, barcode, PDF, Excel and Firebase libraries, bundled so the app works offline |
| `app/src/main/java/.../MainActivity.java` | The Android wrapper: camera permission, back button, file sharing |
| `firestore.rules` | Database access rules (step 3) |
| `.github/workflows/build.yml` | Cloud build for the APK and website |

Free-tier limits: Firebase's free Spark plan allows 50,000 reads and 20,000 writes per day, which is far more than a yard of 312 slots needs.
