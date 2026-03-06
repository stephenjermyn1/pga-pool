// lib/firebase.js
// ⚠️ FILL IN YOUR FIREBASE CONFIG BELOW
// Get these values from: Firebase Console → Project Settings → General → Your Apps → Web App
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBBl5apFSERd3Mp1ifq0efaBj533QSfQzY",
  authDomain: "masters-draft-43f03.firebaseapp.com",
  databaseURL: "https://masters-draft-43f03-default-rtdb.firebaseio.com",
  projectId: "masters-draft-43f03",
  storageBucket: "masters-draft-43f03.firebasestorage.app",
  messagingSenderId: "1044453750366",
  appId: "1:1044453750366:web:51af096a065fa2889826cf"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Save pool state to Firebase
export async function savePool(poolId, data) {
  try {
    await set(ref(db, `pools/${poolId}`), data);
  } catch (e) {
    console.error("Firebase save error:", e);
  }
}

// Load pool state from Firebase (one-time read)
export async function loadPool(poolId) {
  try {
    const snapshot = await get(ref(db, `pools/${poolId}`));
    return snapshot.exists() ? snapshot.val() : null;
  } catch (e) {
    console.error("Firebase load error:", e);
    return null;
  }
}

// Subscribe to real-time updates
export function subscribePool(poolId, callback) {
  const poolRef = ref(db, `pools/${poolId}`);
  return onValue(poolRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
}

export { db, ref, set };
