# Multiplayer Draft - Implementation Plan

## Summary
Add pool creation with join codes, claim-based identity (Firebase Anonymous Auth), draft pick authorization, and admin override. Two files change: `lib/firebase.js` and `app/page.js`. No new dependencies needed.

---

## 1. Firebase Changes (`lib/firebase.js`)

### Add Firebase Anonymous Auth
- Import `getAuth`, `signInAnonymously`, `onAuthStateChanged` from `firebase/auth`
- Import `update`, `runTransaction` from `firebase/database`
- Add `initAuth()` — silently signs in anonymously, returns a persistent device UID (no login UI needed)

### New Functions
- **`generateJoinCode()`** — creates a 6-char alphanumeric code (excludes ambiguous chars like 0/O, 1/I/L)
- **`createPool(adminUid, poolData)`** — generates pool ID + join code, writes pool data and a `joinCodes/{code}` index for lookup
- **`lookupJoinCode(code)`** — resolves a join code to a pool ID
- **`claimPlayer(poolId, playerName, uid)`** — atomically claims a name using `runTransaction` (prevents two people claiming the same name)
- **`updatePool(poolId, updates)`** — partial update helper using `update()`

### New Data Model
```
pools/{poolId}: {
  ...existing fields (players, draftOrder, pickIdx, picks, draftDone, eventName, selectedEvent)...
  joinCode: "X7K9M2",
  adminUid: "firebase-uid-of-creator",
  createdAt: 1709740800000,
  claims: { "Alice": "uid-abc", "Bob": null, "Carol": null, "Dave": null }
}

joinCodes/X7K9M2: { poolId: "abc123" }   // reverse index for fast lookup
```

---

## 2. New App Screens (`app/page.js`)

### Screen Flow
```
"loading" → "home" → "setup" (create pool) → "join" (claim name) → "draft" → "leaderboard"
                  ↘ enter join code → "join" (claim name) ↗
```

### Home Screen (NEW)
- Two options: **"Create a Pool"** and **"Join a Pool"** (with 6-char code input)
- Supports `?pool=JOINCODE` in URL for shareable links
- Returning users skip straight to their pool via localStorage

### Join Screen (NEW)
- Shows the join code prominently + "Copy Invite Link" button
- Lists all player names — unclaimed ones are tappable, claimed ones show "(Taken)"
- Player taps their name to claim it → device is remembered
- Shows "X of Y players joined" counter
- "Continue to Draft" button appears after claiming

### Modified Setup Screen
- Same name entry UI as today
- On submit: calls `createPool()` instead of using hardcoded POOL_ID
- Admin (creator) then goes to Join screen to claim their own name

### Modified Draft Screen
- **Authorization**: Only the current drafter (or admin) can see/use the golfer picker
- Others see: "Waiting for [Name] to pick..."
- Admin sees: "Admin: you can pick on behalf of [Name]"
- Undo button is admin-only
- Real-time sync means all devices update instantly when a pick is made

### Modified Leaderboard Screen
- Reset button is admin-only
- Share button added (copies invite link)
- Everything else unchanged

---

## 3. Identity & Auth Model
- **Firebase Anonymous Auth** — silent, zero-friction, persistent per device
- No passwords, no sign-up, no login screen
- Each device gets a unique UID automatically
- When a player claims a name, their UID is stored in `claims`
- On return visits, localStorage + Firebase claim verification = instant reconnect

## 4. Admin Privileges
- Pool creator's UID stored as `adminUid`
- Can pick on anyone's behalf during draft
- Can undo any pick
- Can reset the pool
- Cannot be transferred (device-bound)

## 5. Firebase Console Setup Required
- Enable **Anonymous** sign-in in Firebase Console → Authentication → Sign-in method

---

## Files Changed
| File | Changes |
|------|---------|
| `lib/firebase.js` | Add Auth init, 5 new functions, 2 new imports |
| `app/page.js` | Remove hardcoded POOL_ID, add ~8 new state vars, add home + join screens, add auth checks in draft, admin-only controls |
| `package.json` | No changes (firebase SDK already includes Auth) |
| `route.js` | No changes |
