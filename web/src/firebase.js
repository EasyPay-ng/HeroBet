// HeroBet — Firebase initialisation (Auth + Firestore + Analytics)
// Client config is public by design; access control lives in Security Rules,
// Authorized Domains and App Check (see docs/SETUP-FIREBASE.md).
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyBbMT9mMiEc3SH9xr3Qz1hdYxAD7pU5cCc",
  authDomain: "herobet-51d74.firebaseapp.com",
  projectId: "herobet-51d74",
  storageBucket: "herobet-51d74.firebasestorage.app",
  messagingSenderId: "795474586653",
  appId: "1:795474586653:web:e0704793c8f4dc090d2af4",
  measurementId: "G-4TPZZS823E",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const analyticsReady = isSupported()
  .then((ok) => (ok ? getAnalytics(app) : null))
  .catch(() => null);
