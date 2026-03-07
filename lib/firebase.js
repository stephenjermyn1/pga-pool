// lib/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, update, runTransaction } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

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
const auth = getAuth(app);

// --- Auth ---

/** Silently sign in anonymously; returns a persistent UID. */
export function initAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        resolve(user.uid);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          resolve(cred.user.uid);
        } catch (e) {
          console.error("Anonymous auth error:", e);
          resolve(null);
        }
      }
    });
  });
}

// --- Join Codes ---

const SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

export function generateJoinCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  return code;
}

// --- Pool CRUD ---

/** Create a new pool with a join code. Returns { poolId, joinCode }. */
export async function createPool(adminUid, poolData) {
  const joinCode = generateJoinCode();
  const poolId = joinCode.toLowerCase() + "-" + Date.now().toString(36);
  const fullData = {
    ...poolData,
    joinCode,
    adminUid,
    createdAt: Date.now(),
    claims: {},
  };
  try {
    await set(ref(db, `pools/${poolId}`), fullData);
    await set(ref(db, `joinCodes/${joinCode}`), { poolId });
    return { poolId, joinCode };
  } catch (e) {
    console.error("Create pool error:", e);
    return null;
  }
}

/** Resolve a join code to a pool ID. */
export async function lookupJoinCode(code) {
  try {
    const snap = await get(ref(db, `joinCodes/${code.toUpperCase()}`));
    return snap.exists() ? snap.val().poolId : null;
  } catch (e) {
    console.error("Join code lookup error:", e);
    return null;
  }
}

/** Claim a player name. Overwrites any existing claim (allows device switching). */
export async function claimPlayer(poolId, playerName, uid) {
  const claimRef = ref(db, `pools/${poolId}/claims/${playerName}`);
  try {
    await set(claimRef, uid);
    return true;
  } catch (e) {
    console.error("Claim error:", e);
    return false;
  }
}

// --- Existing helpers (kept) ---

export async function savePool(poolId, data) {
  try {
    await set(ref(db, `pools/${poolId}`), data);
  } catch (e) {
    console.error("Firebase save error:", e);
  }
}

export async function loadPool(poolId) {
  try {
    const snapshot = await get(ref(db, `pools/${poolId}`));
    return snapshot.exists() ? snapshot.val() : null;
  } catch (e) {
    console.error("Firebase load error:", e);
    return null;
  }
}

export function subscribePool(poolId, callback) {
  const poolRef = ref(db, `pools/${poolId}`);
  return onValue(poolRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
}

export async function updatePool(poolId, updates) {
  try {
    await update(ref(db, `pools/${poolId}`), updates);
  } catch (e) {
    console.error("Firebase update error:", e);
  }
}

export { db, ref, set };
