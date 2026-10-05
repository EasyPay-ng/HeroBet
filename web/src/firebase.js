// HeroBet — Firebase initialisation
// Client config is public by design; access control lives in Security Rules,
// Authorized Domains and App Check (set these up in the Firebase console).
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

export const firebaseConfig = {
  apiKey: "AIzaSyB2bI1Pc3ST8NK-wP7N7j13iSJPfIWTHPU",
  authDomain: "herobet.firebaseapp.com",
  projectId: "herobet",
  storageBucket: "herobet.firebasestorage.app",
  messagingSenderId: "349251259906",
  appId: "1:349251259906:web:2a05814969463900abe11b",
  measurementId: "G-NQW7NXFVBN",
};

export const app = initializeApp(firebaseConfig);

export const analyticsReady = isSupported()
  .then((ok) => (ok ? getAnalytics(app) : null))
  .catch(() => null);
