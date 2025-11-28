import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey) {
  // eslint-disable-next-line no-console
  console.warn("Firebase config missing. Populate environment variables in .env.local.");
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const database = getDatabase(app);
export const MAX_DISTANCE_CM = 250; // adjust to match your scan radius
