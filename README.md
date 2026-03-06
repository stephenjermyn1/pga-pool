# PGA Tour Pool 🏌️⛳

Snake draft & live leaderboard for PGA Tour fantasy golf pools.

## Quick Start

### 1. Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Go to **Build → Realtime Database → Create Database**
4. Choose a location, start in **test mode** (you can add security rules later)
5. Go to **Project Settings → General → Your Apps → Add Web App**
6. Copy the config values into `lib/firebase.js`

### 2. Deploy to Vercel

1. Push this project to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and click **Add New → Project**
3. Import your GitHub repository
4. Click **Deploy** — Vercel auto-detects Next.js
5. Your app will be live at `your-project.vercel.app`

### 3. Use it!

- Share the URL with your friends
- Set up a pool, run the snake draft
- Scores update live from ESPN — just hit Refresh

## Files

```
app/
  layout.js       — HTML wrapper
  page.js         — Main app (draft, leaderboard, golfer detail)
  api/espn/
    route.js       — Server-side ESPN data fetcher (no CORS issues)
lib/
  firebase.js      — Firebase config (⚠️ add your credentials)
```

## Pool Rules

- Snake draft: 1→N, N→1, 1→N, etc.
- 5 golfers per person, best 3 count
- Missed cut = 80 strokes for rounds 3 & 4
- Pick the tournament winner = −10 bonus
