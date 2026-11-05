// Your Firebase web app settings (Firebase console > Project settings > Your apps > Web app).
// See README.md, step 1. These values are not secret: access is controlled by sign-in and the Firestore rules.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBG2lO3qQt5Jl6rT6WF15vCn3Izr5YWxQM",
  authDomain: "rsat-yard-ceac2.firebaseapp.com",
  projectId: "rsat-yard-ceac2",
  storageBucket: "rsat-yard-ceac2.firebasestorage.app",
  messagingSenderId: "174871716184",
  appId: "1:174871716184:web:bfdf9b2a66fdc31e02c52d",
};

// Link shown on the website so staff can download the Android app.
window.APK_URL = "https://github.com/rsatyard/rsat-yard/releases/latest/download/RSAT-Yard.apk";

// GitHub repository the Android app checks for a newer version.
window.UPDATE_REPO = "rsatyard/rsat-yard";

// Office website address, used for the Approve link in access-request emails.
window.SITE_URL = "https://rsatyard.github.io/rsat-yard/";

// EmailJS (emailjs.com) emails the admin when someone asks for access. Leave empty to turn it off.
// These are browser keys, not secrets. Set the template's "To Email" to the admin's address.
window.EMAILJS = {
  serviceId: "",
  templateId: "",
  publicKey: "",
};
