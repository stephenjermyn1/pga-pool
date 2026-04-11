"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { savePool, loadPool, subscribePool, updatePool, initAuth, createPool, lookupJoinCode, claimPlayer, savePhoto, saveTournament, updateTournament, claimAdmin } from "../lib/firebase";

// --- Dynamic Tournament Theming ---
let G, GD, GOLD, CREAM, BOARD_GREEN, BOARD_DARK;
const BOARD_YELLOW = "#f4d03f", BOARD_RED = "#e74c3c";
let CHART_COLORS_DYN;
const PICKS = 6, BEST_OF = 4, WINNER_BONUS = -5, MC_SCORE = 80, PAR = 72;

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const THEMES = {
  masters: {
    G: "#006747", GD: "#004d35", GOLD: "#d4af37", CREAM: "#fdf8e8",
    BOARD_GREEN: "#1a472a", BOARD_DARK: "#0f2d1a",
    chartColors: ["#006747", "#d4af37", "#dc3545", "#2196F3", "#FF9800", "#9C27B0", "#00BCD4", "#795548", "#E91E63", "#4CAF50", "#607D8B", "#FF5722", "#3F51B5", "#8BC34A"],
  },
  players: {
    G: "#002D72", GD: "#001A4B", GOLD: "#C8102E", CREAM: "#f0f4fa",
    BOARD_GREEN: "#0a1e3d", BOARD_DARK: "#061429",
    chartColors: ["#002D72", "#C8102E", "#d4af37", "#2196F3", "#FF9800", "#9C27B0", "#00BCD4", "#795548", "#E91E63", "#4CAF50", "#607D8B", "#FF5722", "#3F51B5", "#8BC34A"],
  },
  pga: {
    G: "#00205B", GD: "#001845", GOLD: "#B8860B", CREAM: "#f0f4fa",
    BOARD_GREEN: "#0a1535", BOARD_DARK: "#060e24",
    chartColors: ["#00205B", "#B8860B", "#dc3545", "#2196F3", "#FF9800", "#9C27B0", "#00BCD4", "#795548", "#E91E63", "#4CAF50", "#607D8B", "#FF5722", "#3F51B5", "#8BC34A"],
  },
  usopen: {
    G: "#003366", GD: "#002244", GOLD: "#C41E3A", CREAM: "#f5f5f5",
    BOARD_GREEN: "#0c1f33", BOARD_DARK: "#081422",
    chartColors: ["#003366", "#C41E3A", "#d4af37", "#2196F3", "#FF9800", "#9C27B0", "#00BCD4", "#795548", "#E91E63", "#4CAF50", "#607D8B", "#FF5722", "#3F51B5", "#8BC34A"],
  },
  open: {
    G: "#1C2841", GD: "#0f1a2e", GOLD: "#B8860B", CREAM: "#f5f2eb",
    BOARD_GREEN: "#141e30", BOARD_DARK: "#0a1220",
    chartColors: ["#1C2841", "#B8860B", "#dc3545", "#2196F3", "#FF9800", "#9C27B0", "#00BCD4", "#795548", "#E91E63", "#4CAF50", "#607D8B", "#FF5722", "#3F51B5", "#8BC34A"],
  },
  default: {
    G: "#C41E3A", GD: "#9B1530", GOLD: "#d4af37", CREAM: "#faf5f5",
    BOARD_GREEN: "#3d0c14", BOARD_DARK: "#2a0810",
    chartColors: ["#C41E3A", "#d4af37", "#003366", "#2196F3", "#FF9800", "#9C27B0", "#00BCD4", "#795548", "#E91E63", "#4CAF50", "#607D8B", "#FF5722", "#3F51B5", "#8BC34A"],
  },
};

function getTheme(eventName) {
  const n = (eventName || "").toLowerCase();
  if (n.includes("masters")) return THEMES.masters;
  if (n.includes("players")) return THEMES.players;
  if (n.includes("pga champ")) return THEMES.pga;
  if (n.includes("u.s. open")) return THEMES.usopen;
  if (n.includes("open championship")) return THEMES.open;
  return THEMES.default;
}

function applyTheme(eventName) {
  const t = getTheme(eventName);
  G = t.G; GD = t.GD; GOLD = t.GOLD; CREAM = t.CREAM;
  BOARD_GREEN = t.BOARD_GREEN; BOARD_DARK = t.BOARD_DARK;
  CHART_COLORS_DYN = t.chartColors;
}
// Initialize with default
applyTheme("");

function fmtPar(val) {
  if (val == null || val === "") return "—";
  if (typeof val === "string") return val;
  if (val === 0) return "E";
  return val > 0 ? "+" + val : "" + val;
}
function parClr(val) {
  if (val == null || val === "" || val === "E" || val === 0) return "#555";
  const n = typeof val === "string" ? parseInt(val) : val;
  if (isNaN(n)) return "#555";
  return n < 0 ? "#dc3545" : n > 0 ? "#333" : "#555";
}
function holeClr(st) {
  if (!st) return "#555"; const n = parseInt(st); if (isNaN(n)) return "#555";
  if (n <= -2) return "#B8860B"; if (n === -1) return "#dc3545";
  if (n >= 2) return "#000"; if (n === 1) return "#666"; return "#555";
}
function holeBg(st) {
  if (!st) return "transparent"; const n = parseInt(st); if (isNaN(n)) return "transparent";
  if (n <= -2) return "rgba(255,215,0,0.2)"; if (n === -1) return "rgba(220,53,69,0.1)";
  if (n >= 2) return "rgba(0,0,0,0.08)"; if (n === 1) return "rgba(0,0,0,0.04)"; return "transparent";
}

function shuffle(a) { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; }
function snake(p, r) { const o=[]; for(let i=0;i<r;i++) o.push(...(i%2===0?p:[...p].reverse())); return o; }
function normName(s) { return s.replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ð/gi, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

export default function App() {
  // --- Identity ---
  const [uid, setUid] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [myName, setMyName] = useState(null); // claimed player name

  // --- Pool state ---
  const [screen, setScreen] = useState("loading");
  const [players, setPlayers] = useState([]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [pickIdx, setPickIdx] = useState(0);
  const [picks, setPicks] = useState({});
  const [draftDone, setDraftDone] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventDetail, setEventDetail] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(0);
  const [espnField, setEspnField] = useState([]);
  const [espnEvents, setEspnEvents] = useState([]);
  const [tournamentDone, setTournamentDone] = useState(false);
  const [tournamentWinner, setTournamentWinner] = useState(null);
  const [claims, setClaims] = useState({});
  const [photos, setPhotos] = useState({});
  const [adminUid, setAdminUid] = useState(null);

  // --- UI state ---
  const [names, setNames] = useState(["", "", "", ""]);
  const [randomOrder, setRandomOrder] = useState(true); // true = randomise, false = use entered order
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showFullLB, setShowFullLB] = useState(false);
  const [golferDetail, setGolferDetail] = useState(null);
  const [kalshiData, setKalshiData] = useState(null); // { available, golfers: { norm_name: { name, cut, top20, ... } } }
  const [kalshiLoading, setKalshiLoading] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [showImportField, setShowImportField] = useState(false);
  const [importText, setImportText] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [editingPicks, setEditingPicks] = useState(null); // { player, pickIdx } or null
  const [pendingPick, setPendingPick] = useState(null); // golfer name awaiting confirmation
  const [editSearch, setEditSearch] = useState("");
  const [tournaments, setTournaments] = useState({});           // all tournaments keyed by id
  const [activeTournamentId, setActiveTournamentId] = useState(null); // which tournament is "live" for ESPN
  const [viewingTournamentId, setViewingTournamentId] = useState(null); // which tournament user is looking at
  const [showNewTournament, setShowNewTournament] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [showSplash, setShowSplash] = useState(false);
  const [showClaimAdmin, setShowClaimAdmin] = useState(false);
  const [claimAdminCode, setClaimAdminCode] = useState("");
  const [claimAdminErr, setClaimAdminErr] = useState("");

  const unsubRef = useRef(null);
  const prevPickIdxRef = useRef(null);
  const [notifEnabled, setNotifEnabled] = useState(false);

  // --- Check notification permission ---
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setNotifEnabled(true);
  }, []);

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") { setNotifEnabled(true); return; }
    const perm = await Notification.requestPermission();
    setNotifEnabled(perm === "granted");
  }, []);

  // --- Splash screen (once per session) ---
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("pga-pool-splash-seen")) {
        setShowSplash(true);
        const t = setTimeout(() => {
          setShowSplash(false);
          try { sessionStorage.setItem("pga-pool-splash-seen", "1"); } catch(e) {}
        }, 3000);
        return () => clearTimeout(t);
      }
    } catch(e) {}
  }, []);

  // --- Apply tournament theme on every render ---
  applyTheme(eventName);

  const S = useMemo(() => ({
    title: { margin: "0 0 4px", fontSize: 19, color: GD }, sub: { margin: "0 0 14px", fontSize: 13, color: "#888" },
    sec: { margin: "0 0 10px", fontSize: 15, color: GD }, row: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
    rowNum: { fontSize: 13, color: "#888", minWidth: 24 },
    input: { flex: 1, padding: "9px 11px", borderRadius: 7, border: "1px solid #ddd", fontSize: 14, outline: "none", fontFamily: "'Georgia',serif", width: "100%", boxSizing: "border-box" },
    searchInput: { width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box", fontFamily: "'Georgia',serif" },
    xBtn: { background: "none", border: "none", fontSize: 16, color: "#999", cursor: "pointer", padding: "4px 8px" },
    dashed: { background: "none", border: "2px dashed " + G, borderRadius: 7, padding: "9px", color: G, fontSize: 13, cursor: "pointer", width: "100%", marginBottom: 4, fontFamily: "'Georgia',serif" },
    primary: { background: "linear-gradient(135deg," + G + "," + GD + ")", color: "white", border: "none", borderRadius: 9, padding: "13px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%", fontFamily: "'Georgia',serif", boxShadow: "0 4px 12px " + hexToRgba(G, 0.25) },
    smallBtn: { background: G, color: "white", border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'Georgia',serif", whiteSpace: "nowrap" },
    badge: { background: G, color: "white", padding: "3px 10px", borderRadius: 16, fontSize: 12, fontWeight: 600 },
    bar: { background: "#e0e0e0", borderRadius: 8, height: 7, overflow: "hidden" },
    barFill: { background: "linear-gradient(90deg," + G + "," + GOLD + ")", height: "100%", borderRadius: 8, transition: "width 0.3s" },
    pickerCard: { background: "linear-gradient(135deg," + G + "," + GD + ")", borderRadius: 12, padding: 22, textAlign: "center", marginBottom: 12, boxShadow: "0 4px 16px " + hexToRgba(G, 0.3) },
    golferBtn: { background: "white", border: "1px solid " + G, borderRadius: 7, padding: "9px 8px", fontSize: 12, cursor: "pointer", textAlign: "left", fontFamily: "'Georgia',serif", color: GD },
    undo: { background: "white", border: "2px solid #ff9800", color: "#ff9800", borderRadius: 9, padding: "11px 16px", fontSize: 13, cursor: "pointer", width: "100%", fontFamily: "'Georgia',serif", fontWeight: 600, marginTop: 2 },
    teamCard: { background: CREAM, borderRadius: 9, padding: 12, marginBottom: 10 },
    teamName: { fontSize: 15, fontWeight: 700, color: GD, marginBottom: 6 },
    ctrl: { background: "white", border: "1px solid #ddd", borderRadius: 7, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: "'Georgia',serif" },
    eventBanner: { background: "linear-gradient(135deg," + G + "," + GD + ")", borderRadius: 10, padding: "12px 16px", marginBottom: 12, textAlign: "center" },
    winnerBanner: { background: "linear-gradient(135deg, #d4af37, #f5d478)", borderRadius: 10, padding: "12px 16px", textAlign: "center", fontSize: 17, fontWeight: 700, color: GD, marginBottom: 12, boxShadow: "0 3px 10px rgba(212,175,55,0.3)" },
    mc: { marginLeft: 5, fontSize: 10, background: "#dc3545", color: "white", padding: "1px 5px", borderRadius: 3, fontWeight: 700 },
    rule: { margin: "4px 0", fontSize: 13, color: "#555" },
    overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 },
    modal: { background: "white", borderRadius: 14, padding: "24px 20px", maxWidth: 400, width: "100%", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" },
    eventBtn: { display: "block", width: "100%", textAlign: "left", padding: "14px 16px", marginBottom: 8, background: CREAM, border: "2px solid " + G, borderRadius: 10, cursor: "pointer", fontFamily: "'Georgia',serif" },
  }), [eventName]);

  const notify = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2500); }, []);

  // ---- Init auth + check for returning user / URL pool code ----
  useEffect(() => {
    (async () => {
      const userId = await initAuth();
      setUid(userId);

      // Check URL for ?pool=JOINCODE
      const params = new URLSearchParams(window.location.search);
      const urlCode = params.get("pool");

      // Check localStorage for returning user
      const savedPoolId = localStorage.getItem("pga-pool-id");

      if (urlCode) {
        // URL join code takes priority
        const pid = await lookupJoinCode(urlCode);
        if (pid) {
          await enterPool(pid, userId);
        } else {
          setScreen("home");
          notify("Invalid join code");
        }
      } else if (savedPoolId) {
        // Returning user — try to reload their pool
        const data = await loadPool(savedPoolId);
        if (data) {
          await enterPool(savedPoolId, userId);
        } else {
          localStorage.removeItem("pga-pool-id");
          localStorage.removeItem("pga-pool-name");
          setScreen("home");
        }
      } else {
        setScreen("home");
      }
    })();
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Enter a pool: load data, subscribe, figure out identity ----
  const enterPool = useCallback(async (pid, userId) => {
    const data = await loadPool(pid);
    if (!data) return;

    // Unsubscribe from any previous pool
    if (unsubRef.current) unsubRef.current();

    setPoolId(pid);
    setJoinCode(data.joinCode || "");
    setAdminUid(data.adminUid || null);
    setIsAdmin(data.adminUid === userId);
    setClaims(data.claims || {});
    setPhotos(data.photos || {});
    applyPoolData(data);

    // Check if this user has a claim
    const claimedName = Object.entries(data.claims || {}).find(([, v]) => v === userId)?.[0] || null;
    setMyName(claimedName);

    // Save to localStorage
    localStorage.setItem("pga-pool-id", pid);
    if (claimedName) localStorage.setItem("pga-pool-name", claimedName);

    // Decide which screen — check tournament-level draftDone
    const hasTournaments = data.tournaments && Object.keys(data.tournaments).length > 0;
    const activeT = hasTournaments
      ? data.tournaments[data.activeTournamentId || Object.keys(data.tournaments)[0]]
      : data;
    const activeDraftDone = activeT?.draftDone || false;
    const hasNoTournaments = data.tournaments && Object.keys(data.tournaments).length === 0;

    if (!claimedName) {
      setScreen("join");
    } else if (hasNoTournaments) {
      // Pool exists but no tournaments — go to join/home screen to create one
      setScreen("join");
    } else if (activeDraftDone) {
      setScreen("leaderboard");
    } else if (data.players?.length > 0) {
      setScreen("draft");
    } else {
      setScreen("join");
    }

    // Subscribe to real-time changes
    prevPickIdxRef.current = data.pickIdx || 0;
    unsubRef.current = subscribePool(pid, (snap) => {
      if (snap) {
        // Detect turn change and notify
        const newPickIdx = snap.pickIdx || 0;
        const prevIdx = prevPickIdxRef.current;
        if (newPickIdx !== prevIdx && !snap.draftDone) {
          const nextDrafter = snap.draftOrder?.[newPickIdx];
          const claimsMap = snap.claims || {};
          if (nextDrafter && claimsMap[nextDrafter] === userId) {
            // It's my turn — fire notification + tab title flash
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("It's your turn!", { body: `${nextDrafter}, you're up to pick!`, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⛳</text></svg>" });
            }
            // Flash tab title
            const orig = document.title;
            let flash = true;
            const iv = setInterval(() => {
              document.title = flash ? "⛳ YOUR TURN!" : orig;
              flash = !flash;
            }, 1000);
            const stopFlash = () => { clearInterval(iv); document.title = orig; document.removeEventListener("visibilitychange", stopFlash); };
            document.addEventListener("visibilitychange", stopFlash);
            setTimeout(stopFlash, 15000);
          }
        }
        prevPickIdxRef.current = newPickIdx;

        // Preserve current viewing tournament when applying real-time updates
        applyPoolData(snap, undefined);
        setClaims(snap.claims || {});
        setPhotos(snap.photos || {});
        setAdminUid(snap.adminUid || null);
        setIsAdmin(snap.adminUid === userId);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPoolData(data, overrideViewingId) {
    const p = data.players || [];
    setPlayers(p);

    // --- Multi-tournament detection ---
    if (data.tournaments && Object.keys(data.tournaments).length > 0) {
      // New format: pool has tournaments sub-object
      const allT = data.tournaments;
      setTournaments(allT);
      const activeId = data.activeTournamentId || Object.keys(allT)[0];
      setActiveTournamentId(activeId);
      // Determine which tournament to view
      let resolvedViewId = overrideViewingId || activeId;
      setViewingTournamentId(prev => {
        const id = overrideViewingId || prev || activeId;
        resolvedViewId = allT[id] ? id : activeId;
        return resolvedViewId;
      });
      // Apply the viewed tournament's data
      const t = allT[resolvedViewId] || allT[activeId] || {};
      applyTournamentData(t, p);
      // If the viewed tournament has a persisted imported field, load it
      if (t.importedField) {
        const field = Array.isArray(t.importedField) ? t.importedField : Object.values(t.importedField);
        setEspnField(field);
      }
    } else {
      // Old format: flat pool data — synthesize a single tournament
      const legacyId = data._legacyTournamentId || "legacy";
      const legacyT = {
        eventName: data.eventName || "",
        selectedEvent: data.selectedEvent || 0,
        draftOrder: data.draftOrder || [],
        pickIdx: data.pickIdx || 0,
        picks: data.picks || {},
        draftDone: data.draftDone || false,
        status: "active",
      };
      setTournaments({ [legacyId]: legacyT });
      setActiveTournamentId(legacyId);
      setViewingTournamentId(legacyId);
      applyTournamentData(legacyT, p);
    }
  }

  function applyTournamentData(t, p) {
    // Firebase may return arrays as objects with numeric keys — convert back
    let order = t.draftOrder || [];
    if (order && !Array.isArray(order)) order = Object.values(order);
    // Auto-extend draft order if PICKS increased (e.g. 5→6 rounds)
    const expectedLen = p.length * PICKS;
    if (p.length > 0 && order.length > 0 && order.length < expectedLen) {
      const existingRounds = order.length / p.length;
      const extraRounds = [];
      for (let i = existingRounds; i < PICKS; i++) {
        extraRounds.push(...(i % 2 === 0 ? p : [...p].reverse()));
      }
      order = [...order, ...extraRounds];
    }
    setDraftOrder(order);
    setPickIdx(t.pickIdx || 0);
    // Firebase may return pick arrays as objects too — normalize
    const rawPicks = t.picks || {};
    const normalizedPicks = {};
    for (const [k, v] of Object.entries(rawPicks)) {
      normalizedPicks[k] = Array.isArray(v) ? v : (v ? Object.values(v) : []);
    }
    setPicks(normalizedPicks);
    // Only mark done if we've actually completed all PICKS rounds
    const shouldBeDone = (t.pickIdx || 0) >= expectedLen;
    setDraftDone(p.length > 0 ? shouldBeDone : (t.draftDone || false));
    setEventName(t.eventName || "");
    setSelectedEvent(t.selectedEvent || 0);
  }

  // ---- Save state changes ----
  const saveState = useCallback((overrides = {}) => {
    if (!poolId) return;
    const tid = viewingTournamentId;
    if (tid && tid !== "legacy") {
      // New multi-tournament format: use update() to avoid wiping importedField, createdAt, etc.
      const updates = {
        eventName, selectedEvent, draftOrder, pickIdx, picks, draftDone,
        ...overrides,
      };
      // Remove non-tournament keys that might be in overrides
      delete updates.players; delete updates.joinCode; delete updates.adminUid; delete updates.claims;
      updateTournament(poolId, tid, updates);
      // Also keep the tournaments map in sync locally
      setTournaments(prev => ({ ...prev, [tid]: { ...prev[tid], ...updates } }));
    } else {
      // Legacy format: save flat
      const state = {
        players, draftOrder, pickIdx, picks, draftDone, eventName, selectedEvent,
        joinCode, adminUid, claims,
        ...overrides,
      };
      savePool(poolId, state);
    }
  }, [poolId, viewingTournamentId, players, draftOrder, pickIdx, picks, draftDone, eventName, selectedEvent, joinCode, adminUid, claims]);

  // ---- Fetch ESPN ----
  const fetchESPN = useCallback(async (evIdx) => {
    setIsLoading(true); setFetchErr(null);
    try {
      const idx = evIdx != null ? evIdx : selectedEvent;
      const resp = await fetch(`/api/espn?event=${idx}`);
      if (!resp.ok) throw new Error("API returned " + resp.status);
      const data = await resp.json();

      if (data.error) { setFetchErr(data.error); setIsLoading(false); return null; }

      if (data.events?.length > 1 && evIdx == null) {
        setEspnEvents(data.events);
        setShowEventPicker(true);
        setIsLoading(false);
        return null;
      }

      setEspnField(data.field);
      setEspnEvents(data.events || []);
      setEventName(data.eventName);
      setEventDetail(data.detail);
      setTournamentDone(data.isComplete);
      setTournamentWinner(data.winner);
      setSelectedEvent(idx);
      setLastUpdated(new Date().toLocaleTimeString());
      setIsLoading(false);
      notify(`Loaded ${data.field.length} golfers`);
      return data;
    } catch (err) {
      console.error(err);
      setFetchErr("Could not fetch scores: " + err.message);
      setIsLoading(false);
      return null;
    }
  }, [selectedEvent, notify]);

  // Auto-fetch on leaderboard (only for active tournament)
  useEffect(() => {
    if (screen === "leaderboard" && (!viewingTournamentId || viewingTournamentId === activeTournamentId || viewingTournamentId === "legacy")) {
      fetchESPN(selectedEvent);
    }
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Fetch Kalshi prediction market data ----
  const fetchKalshi = useCallback(async (evName) => {
    const name = evName || eventName;
    if (!name) return;
    setKalshiLoading(true);
    try {
      const resp = await fetch(`/api/kalshi?event=${encodeURIComponent(name)}`);
      if (!resp.ok) throw new Error("API returned " + resp.status);
      const data = await resp.json();
      setKalshiData(data);
    } catch (err) {
      console.error("Kalshi fetch error:", err);
      setKalshiData({ available: false, golfers: {} });
    }
    setKalshiLoading(false);
  }, [eventName]);

  // Auto-fetch Kalshi when event name changes on leaderboard
  useEffect(() => {
    if (screen === "leaderboard" && eventName) fetchKalshi(eventName);
  }, [screen, eventName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: look up Kalshi data for a golfer name
  const getKalshiOdds = useCallback((golferName) => {
    if (!kalshiData?.available || !kalshiData.golfers) return null;
    const norm = (golferName || "").replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ð/gi, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
    // Direct match
    if (kalshiData.golfers[norm]) return kalshiData.golfers[norm];
    // Fuzzy: check if any Kalshi name contains or is contained by the search
    const parts = norm.split(" ");
    const lastName = parts[parts.length - 1];
    for (const [key, val] of Object.entries(kalshiData.golfers)) {
      if (key.includes(norm) || norm.includes(key)) return val;
      // Last name + first initial match
      const kParts = key.split(" ");
      const kLast = kParts[kParts.length - 1];
      if (kLast === lastName && kParts[0]?.[0] === parts[0]?.[0]) return val;
    }
    return null;
  }, [kalshiData]);

  // ---- Pool Leaderboard ----
  const poolLB = (() => {
    if (!players.length || !Object.keys(picks).length || !espnField.length) return [];
    return players.map(player => {
      const myGolfers = (picks[player] || []).map(golfer => {
        let e = espnField.find(f => f.name === golfer);
        if (!e) e = espnField.find(f => normName(f.name) === normName(golfer));
        if (!e) e = espnField.find(f => normName(f.name).includes(normName(golfer)) || normName(golfer).includes(normName(f.name)));
        if (e) {
          let stp = e.scoreToPar;
          if (e.status === "cut" && e.roundsCompleted <= 2) {
            const extra = (MC_SCORE - PAR) * 2;
            const cur = stp === "E" ? 0 : parseInt(stp) || 0;
            stp = fmtPar(cur + extra);
          }
          const parNum = stp === "E" ? 0 : parseInt(stp) || 0;
          const isW = tournamentWinner && normName(golfer) === normName(tournamentWinner);
          return { name: golfer, scoreToPar: stp, parNum, rounds: e.rounds, status: e.status, holesPlayed: e.holesPlayed, isWinner: isW, found: true };
        }
        return { name: golfer, scoreToPar: "—", parNum: 999, rounds: [], status: "unknown", holesPlayed: 0, isWinner: false, found: false };
      });
      const sorted = [...myGolfers].sort((a, b) => a.parNum - b.parNum);
      const counting = sorted.slice(0, BEST_OF);
      let cp = counting.reduce((s, g) => s + (g.parNum === 999 ? 0 : g.parNum), 0);
      const hasW = myGolfers.some(g => g.isWinner);
      if (hasW) cp += WINNER_BONUS;
      const hasScores = myGolfers.some(g => g.found && g.holesPlayed > 0);
      const countingGolfers = counting.filter(g => g.found);
      const roundScores = [0, 1, 2, 3].map(ri => {
        const vals = countingGolfers.map(g => {
          const rd = g.rounds?.[ri];
          if (!rd) return null;
          if (rd.isComplete && rd.strokes != null) return rd.strokes - PAR;
          if (rd.holesPlayed > 0 && rd.displayValue != null) {
            const v = rd.displayValue === "E" ? 0 : parseInt(rd.displayValue);
            return isNaN(v) ? null : v;
          }
          return null;
        }).filter(v => v != null);
        if (!vals.length) return null;
        return vals.reduce((s, v) => s + v, 0);
      });
      const roundInProgress = [0, 1, 2, 3].map(ri =>
        countingGolfers.some(g => { const rd = g.rounds?.[ri]; return rd && rd.holesPlayed > 0 && !rd.isComplete; })
      );
      return { name: player, golfers: sorted, counting: counting.map(g => g.name), combinedPar: cp, hasWinner: hasW, hasScores, roundScores, roundInProgress };
    }).sort((a, b) => {
      if (!a.hasScores && !b.hasScores) return 0;
      if (!a.hasScores) return 1; if (!b.hasScores) return -1;
      return a.combinedPar - b.combinedPar;
    });
  })();

  // ---- Helpers ----
  const claimedCount = Object.values(claims).filter(Boolean).length;
  const drafter = draftOrder[pickIdx];
  const canPick = uid && (
    (claims[drafter] === uid) || isAdmin
  );

  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?pool=${joinCode}`;
    navigator.clipboard.writeText(url).then(() => notify("Invite link copied!")).catch(() => notify("Couldn't copy"));
  };

  const fetchCalendar = async () => {
    setCalendarLoading(true);
    try {
      const resp = await fetch("/api/espn/calendar");
      if (!resp.ok) throw new Error("API returned " + resp.status);
      const data = await resp.json();
      setCalendarEvents(data.upcoming || []);
      setShowCalendar(true);
    } catch (e) {
      console.error(e);
      notify("Couldn't load calendar");
    }
    setCalendarLoading(false);
  };

  const selectTournament = async (event) => {
    setShowCalendar(false);
    if (event.hasField) {
      // ESPN has the field — fetch it
      await fetchESPN(0);
      if (event.name) {
        setEventName(event.name);
        if (poolId && viewingTournamentId && viewingTournamentId !== "legacy") {
          updateTournament(poolId, viewingTournamentId, { eventName: event.name });
        } else if (poolId) {
          updatePool(poolId, { eventName: event.name });
        }
      }
    } else {
      // No field yet — set event name and open import
      setEventName(event.name);
      if (poolId && viewingTournamentId && viewingTournamentId !== "legacy") {
        updateTournament(poolId, viewingTournamentId, { eventName: event.name });
      } else if (poolId) {
        updatePool(poolId, { eventName: event.name });
      }
      setShowImportField(true);
      notify(`${event.name} — no ESPN field yet, import one manually`);
    }
  };

  const importField = (text) => {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const golfers = lines.map(line => {
      // Detect "LASTNAME, Firstname" or "Lastname, Firstname" format
      if (line.includes(",")) {
        const [last, first] = line.split(",").map(s => s.trim());
        if (first && last) {
          // Handle ALL CAPS: "MCILROY" → "McIlroy" isn't easy, so just title-case
          const fixCase = (s) => {
            if (s === s.toUpperCase() && s.length > 2) {
              return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            }
            return s;
          };
          return `${first} ${fixCase(last)}`;
        }
      }
      return line;
    });
    // Create espnField-compatible entries
    const field = golfers.map((name, i) => ({
      name,
      order: i + 1,
      scoreToPar: "—",
      holesPlayed: 0,
      status: "active",
      rounds: [],
      country: "",
      countryFlag: "",
      athleteId: null,
      roundsCompleted: 0,
    }));
    setEspnField(field);
    setShowImportField(false);
    setImportText("");
    // Persist imported field to Firebase so other users see it
    if (poolId && viewingTournamentId && viewingTournamentId !== "legacy") {
      updateTournament(poolId, viewingTournamentId, { importedField: field });
    }
    notify(`Imported ${field.length} golfers`);
  };

  const leavePool = () => {
    if (unsubRef.current) unsubRef.current();
    localStorage.removeItem("pga-pool-id");
    localStorage.removeItem("pga-pool-name");
    setPoolId(null); setPlayers([]); setDraftOrder([]); setPickIdx(0);
    setPicks({}); setDraftDone(false); setEspnField([]); setEventName("");
    setNames(["", "", "", ""]); setMyName(null); setJoinCode("");
    setClaims({}); setPhotos({}); setAdminUid(null); setIsAdmin(false);
    setTournaments({}); setActiveTournamentId(null); setViewingTournamentId(null);
    // Clear URL params if present
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);
    setScreen("home");
  };

  // ---- Switch between tournaments ----
  const switchTournament = useCallback((tid) => {
    if (!tid || !tournaments[tid]) return;
    setViewingTournamentId(tid);
    const t = tournaments[tid];
    applyTournamentData(t, players);
    // Load the tournament's imported field if it exists, otherwise clear
    if (t.importedField) {
      const field = Array.isArray(t.importedField) ? t.importedField : Object.values(t.importedField);
      setEspnField(field);
    } else {
      setEspnField([]);
    }
    // Go to the appropriate screen
    if (t.draftDone) {
      // If this is the active tournament, go to leaderboard; otherwise show draft complete
      setScreen(tid === activeTournamentId ? "leaderboard" : "draft");
    } else {
      setScreen("draft");
    }
  }, [tournaments, players, activeTournamentId]);

  // ---- Create a new tournament for this pool ----
  const createNewTournament = useCallback(async (tournamentName, importedFieldData, customOrder) => {
    if (!poolId || !isAdmin) return;
    const tid = tournamentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) + "-" + Date.now().toString(36);
    const playerOrder = customOrder || shuffle(players);
    const order = snake(playerOrder, PICKS);
    const p = {}; playerOrder.forEach(n => p[n] = []);
    const tData = {
      eventName: tournamentName,
      selectedEvent: 0,
      draftOrder: order,
      pickIdx: 0,
      picks: p,
      draftDone: false,
      status: "upcoming",
      createdAt: Date.now(),
    };
    if (importedFieldData && importedFieldData.length > 0) {
      tData.importedField = importedFieldData;
    }
    // Save to Firebase
    await saveTournament(poolId, tid, tData);
    // Set as active tournament
    await updatePool(poolId, { activeTournamentId: tid });
    // Update local state
    setTournaments(prev => ({ ...prev, [tid]: tData }));
    setActiveTournamentId(tid);
    setViewingTournamentId(tid);
    applyTournamentData(tData, players);
    if (importedFieldData && importedFieldData.length > 0) {
      setEspnField(importedFieldData);
    } else {
      setEspnField([]);
    }
    setScreen("draft");
    notify(`Created tournament: ${tournamentName}`);
    return tid;
  }, [poolId, isAdmin, players, notify]);

  // ---- New Tournament Modal ----
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newTournamentImport, setNewTournamentImport] = useState("");
  const [newTournamentStep, setNewTournamentStep] = useState("name"); // "name" | "field" | "calendar"
  const [newTournamentRandomOrder, setNewTournamentRandomOrder] = useState(true);
  const [newTournamentPlayerOrder, setNewTournamentPlayerOrder] = useState([]); // manual reorder

  const NewTournamentModal = showNewTournament ? (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 480 }}>
        {newTournamentStep === "name" && (<>
          <h3 style={S.title}>New Tournament</h3>
          <p style={S.sub}>Set up a new draft for an upcoming tournament.</p>
          <input
            style={{ ...S.input, marginBottom: 12 }}
            placeholder="Tournament name (e.g. The Masters)"
            value={newTournamentName}
            onChange={e => setNewTournamentName(e.target.value)}
            autoFocus
          />

          {/* Draft order toggle */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: GD, marginBottom: 6 }}>Draft Order</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{
                flex: 1, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                border: newTournamentRandomOrder ? "2px solid " + G : "2px solid #e0e0e0",
                background: newTournamentRandomOrder ? CREAM : "white",
                fontSize: 12, fontWeight: newTournamentRandomOrder ? 700 : 400, color: newTournamentRandomOrder ? G : "#666",
                fontFamily: "'Georgia',serif",
              }} onClick={() => setNewTournamentRandomOrder(true)}>
                🎲 Random
              </button>
              <button style={{
                flex: 1, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                border: !newTournamentRandomOrder ? "2px solid " + G : "2px solid #e0e0e0",
                background: !newTournamentRandomOrder ? CREAM : "white",
                fontSize: 12, fontWeight: !newTournamentRandomOrder ? 700 : 400, color: !newTournamentRandomOrder ? G : "#666",
                fontFamily: "'Georgia',serif",
              }} onClick={() => { setNewTournamentRandomOrder(false); setNewTournamentPlayerOrder([...players]); }}>
                📋 Manual
              </button>
            </div>
          </div>

          {/* Manual order reorder list */}
          {!newTournamentRandomOrder && newTournamentPlayerOrder.length > 0 && (
            <div style={{ marginBottom: 10, border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Drag order — #1 picks first</div>
              {newTournamentPlayerOrder.map((name, i) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 4px", borderBottom: i < newTournamentPlayerOrder.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: G, minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontSize: 13, color: GD }}>{name}</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button style={{ background: "none", border: "none", fontSize: 11, color: i === 0 ? "#ddd" : "#888", cursor: i === 0 ? "default" : "pointer", padding: "2px 4px" }}
                      disabled={i === 0}
                      onClick={() => { const u = [...newTournamentPlayerOrder]; [u[i - 1], u[i]] = [u[i], u[i - 1]]; setNewTournamentPlayerOrder(u); }}>▲</button>
                    <button style={{ background: "none", border: "none", fontSize: 11, color: i === newTournamentPlayerOrder.length - 1 ? "#ddd" : "#888", cursor: i === newTournamentPlayerOrder.length - 1 ? "default" : "pointer", padding: "2px 4px" }}
                      disabled={i === newTournamentPlayerOrder.length - 1}
                      onClick={() => { const u = [...newTournamentPlayerOrder]; [u[i], u[i + 1]] = [u[i + 1], u[i]]; setNewTournamentPlayerOrder(u); }}>▼</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.primary, flex: 1 }}
              disabled={!newTournamentName.trim()}
              onClick={() => setNewTournamentStep("field")}>
              Next
            </button>
            <button style={{ ...S.ctrl, flex: 1 }}
              onClick={async () => {
                // Try to fetch calendar for easy selection
                setCalendarLoading(true);
                try {
                  const resp = await fetch("/api/espn/calendar");
                  if (!resp.ok) throw new Error();
                  const data = await resp.json();
                  setCalendarEvents(data.upcoming || []);
                  setNewTournamentStep("calendar");
                } catch (e) {
                  notify("Couldn't load calendar");
                }
                setCalendarLoading(false);
              }}>
              {calendarLoading ? "Loading..." : "Browse Upcoming"}
            </button>
          </div>
          <button style={{ ...S.ctrl, marginTop: 8, width: "100%" }}
            onClick={() => { setShowNewTournament(false); setNewTournamentName(""); setNewTournamentStep("name"); setNewTournamentRandomOrder(true); }}>
            Cancel
          </button>
        </>)}

        {newTournamentStep === "calendar" && (<>
          <h3 style={S.title}>Upcoming Tournaments</h3>
          <p style={S.sub}>Select a tournament from the ESPN calendar.</p>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {calendarEvents.map(ev => {
              const start = new Date(ev.startDate);
              const dateStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <button key={ev.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "12px 14px", marginBottom: 6,
                  borderRadius: 10, cursor: "pointer",
                  border: "2px solid #e8e8e8", background: "white",
                  fontFamily: "'Georgia',serif", fontSize: 14, textAlign: "left",
                }} onClick={async () => {
                  setNewTournamentName(ev.name);
                  if (ev.hasField) {
                    // ESPN has the field — create tournament and fetch live
                    const customOrd = newTournamentRandomOrder ? null : (newTournamentPlayerOrder.length ? newTournamentPlayerOrder : null);
                    const tid = await createNewTournament(ev.name, null, customOrd);
                    if (tid) {
                      await fetchESPN(0);
                      setShowNewTournament(false);
                      setNewTournamentName("");
                      setNewTournamentStep("name");
                      setNewTournamentRandomOrder(true);
                    }
                  } else {
                    // No field yet — go to import step
                    setNewTournamentStep("field");
                  }
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: GD }}>{ev.name}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{dateStr}</div>
                  </div>
                  <div style={{ fontSize: 11, color: ev.hasField ? G : "#999", fontWeight: 600 }}>
                    {ev.hasField ? "Field ready" : "Import needed"}
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={{ ...S.ctrl, flex: 1 }} onClick={() => setNewTournamentStep("name")}>← Back</button>
            <button style={{ ...S.ctrl, flex: 1 }} onClick={() => { setShowNewTournament(false); setNewTournamentName(""); setNewTournamentStep("name"); }}>Cancel</button>
          </div>
        </>)}

        {newTournamentStep === "field" && (<>
          <h3 style={S.title}>{newTournamentName || "Import Field"}</h3>
          <p style={S.sub}>Paste golfer names, one per line. Supports "Lastname, Firstname" format.</p>
          <textarea
            value={newTournamentImport}
            onChange={e => setNewTournamentImport(e.target.value)}
            placeholder={"Scheffler, Scottie\nMcIlroy, Rory\nRahm, Jon\n..."}
            style={{ width: "100%", minHeight: 200, padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 13, fontFamily: "'Georgia',serif", resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>
            {newTournamentImport.split("\n").filter(l => l.trim()).length} golfers detected
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.primary, flex: 2 }}
              disabled={newTournamentImport.split("\n").filter(l => l.trim()).length < 2 || !newTournamentName.trim()}
              onClick={async () => {
                // Parse the field
                const lines = newTournamentImport.split("\n").map(l => l.trim()).filter(l => l.length > 0);
                const golfers = lines.map(line => {
                  if (line.includes(",")) {
                    const [last, first] = line.split(",").map(s => s.trim());
                    if (first && last) {
                      const fixCase = (s) => s === s.toUpperCase() && s.length > 2 ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
                      return `${first} ${fixCase(last)}`;
                    }
                  }
                  return line;
                });
                const field = golfers.map((name, i) => ({
                  name, order: i + 1, scoreToPar: "—", holesPlayed: 0, status: "active",
                  rounds: [], country: "", countryFlag: "", athleteId: null, roundsCompleted: 0,
                }));
                const customOrd = newTournamentRandomOrder ? null : (newTournamentPlayerOrder.length ? newTournamentPlayerOrder : null);
                await createNewTournament(newTournamentName.trim(), field, customOrd);
                setShowNewTournament(false);
                setNewTournamentName("");
                setNewTournamentImport("");
                setNewTournamentStep("name");
                setNewTournamentRandomOrder(true);
              }}>
              Create Tournament ({newTournamentImport.split("\n").filter(l => l.trim()).length} golfers)
            </button>
            <button style={{ ...S.ctrl, flex: 1 }}
              disabled={!newTournamentName.trim()}
              onClick={async () => {
                // Create with no field — can fetch/import later
                const customOrd = newTournamentRandomOrder ? null : (newTournamentPlayerOrder.length ? newTournamentPlayerOrder : null);
                await createNewTournament(newTournamentName.trim(), null, customOrd);
                setShowNewTournament(false);
                setNewTournamentName("");
                setNewTournamentImport("");
                setNewTournamentStep("name");
                setNewTournamentRandomOrder(true);
              }}>
              Skip Import
            </button>
          </div>
          <button style={{ ...S.ctrl, marginTop: 8, width: "100%" }}
            onClick={() => setNewTournamentStep(calendarEvents.length > 0 ? "calendar" : "name")}>
            ← Back
          </button>
        </>)}
      </div>
    </div>
  ) : null;

  // ---- Event Picker ----
  const EventPicker = showEventPicker ? (
    <div style={S.overlay}>
      <div style={S.modal}>
        <h3 style={S.title}>Choose Event</h3>
        <p style={S.sub}>Multiple PGA Tour events this week:</p>
        {espnEvents.map(ev => (
          <button key={ev.idx} style={S.eventBtn} onClick={async () => {
            setShowEventPicker(false);
            await fetchESPN(ev.idx);
          }}>
            <div style={{ fontWeight: 700, color: GD }}>{ev.name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{ev.status}</div>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  // ---- Fetch athlete profile on demand ----
  useEffect(() => {
    if (!golferDetail) { setAthleteProfile(null); return; }
    const g = espnField.find(f => f.name === golferDetail) || espnField.find(f => f.name.toLowerCase().includes(golferDetail.toLowerCase()));
    if (!g?.athleteId) return;
    setProfileLoading(true);
    fetch(`/api/espn/athlete?id=${g.athleteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setAthleteProfile(data); setProfileLoading(false); })
      .catch(() => setProfileLoading(false));
  }, [golferDetail, espnField]);

  // ---- GOLFER DETAIL ----
  if (golferDetail) {
    const g = espnField.find(f => f.name === golferDetail) || espnField.find(f => f.name.toLowerCase().includes(golferDetail.toLowerCase()));
    const p = athleteProfile;
    return (
      <Shell joinCode={poolId ? joinCode : null} onHome={poolId ? leavePool : undefined}>
        <button style={{ ...S.ctrl, marginBottom: 10 }} onClick={() => setGolferDetail(null)}>← Back</button>

        {/* Profile header card */}
        <Card>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
            {/* Headshot */}
            <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", background: "#f0f0f0", border: "3px solid " + G, flexShrink: 0 }}>
              {(p?.headshot || g?.athleteId) ? (
                <img
                  src={p?.headshot || `https://a.espncdn.com/i/headshots/golf/players/full/${g.athleteId}.png`}
                  alt={golferDetail}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={e => { e.target.style.display = "none"; }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#ccc" }}>⛳</div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ ...S.title, fontSize: 20, marginBottom: 2 }}>{golferDetail}</h2>
              {/* Country + flag */}
              {(p?.country || g?.country) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  {(p?.countryFlag || g?.countryFlag) && <img src={p?.countryFlag || g?.countryFlag} alt="" style={{ width: 18, height: 12, objectFit: "cover", borderRadius: 2 }} />}
                  <span style={{ fontSize: 13, color: "#666" }}>{p?.country || g?.country}</span>
                </div>
              )}
              {/* Bio details */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "#888" }}>
                {p?.age && <span>Age {p.age}</span>}
                {p?.hand && <span>{p.hand}-handed</span>}
                {p?.college && <span>{p.college}</span>}
              </div>
              {profileLoading && <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Loading profile...</div>}
            </div>
          </div>

          {/* Tournament stats row */}
          {g ? (
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <Stat label="Overall" value={g.scoreToPar} color={parClr(g.scoreToPar)} />
              <Stat label="Position" value={g.order} color={GD} />
              <Stat label="Thru" value={g.holesPlayed > 0 ? g.holesPlayed : "—"} color={GD} />
              {g.status === "cut" && <Stat label="Status" value="MC" color="#dc3545" />}
            </div>
          ) : null}
        </Card>

        {/* Season stats card */}
        {p?.seasonStats && Object.keys(p.seasonStats).length > 0 && (
          <Card>
            <h3 style={S.sec}>2026 Season</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {Object.entries(p.seasonStats).map(([key, st]) => (
                <div key={key} style={{ background: "#f8f9fa", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>{st.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: GD }}>{st.value}</div>
                  {st.rank && <div style={{ fontSize: 10, color: GOLD }}>Rank: {st.rank}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Prediction market odds */}
        {(() => {
          const odds = getKalshiOdds(golferDetail);
          const categories = [
            { key: "cut", label: "Make Cut", icon: "✂️" },
            { key: "top20", label: "Top 20", icon: "🏌️" },
            { key: "top10", label: "Top 10", icon: "🔟" },
            { key: "top5", label: "Top 5", icon: "🏅" },
            { key: "winner", label: "Win", icon: "🏆" },
          ];
          return (
            <Card>
              <h3 style={S.sec}>Prediction Markets</h3>
              {kalshiLoading ? (
                <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 8 }}>Loading market data...</div>
              ) : odds ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {categories.map(({ key, label }) => {
                    const pct = odds[key];
                    const barColor = key === "cut" ? (pct >= 70 ? "#4CAF50" : pct >= 40 ? "#FF9800" : "#dc3545")
                      : G;
                    return (
                      <div key={key} style={{ flex: "1 1 80px", minWidth: 75, background: "#f8f9fa", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                        {pct != null ? (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, color: barColor }}>{pct}%</div>
                            <div style={{ ...S.bar, marginTop: 4, height: 5 }}>
                              <div style={{ background: barColor, height: "100%", borderRadius: 8, width: pct + "%", transition: "width 0.5s" }} />
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 16, fontWeight: 600, color: "#ccc" }}>N/A</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 8 }}>
                  {kalshiData?.available === false ? "Market data not available for this tournament" : "No odds found for this golfer"}
                </div>
              )}
              <div style={{ fontSize: 10, color: "#bbb", textAlign: "center", marginTop: 8 }}>Source: {kalshiData?.source === "espn" ? "ESPN / sportsbook odds" : "Kalshi prediction markets"}</div>
            </Card>
          );
        })()}

        {/* Round scores */}
        {g ? (
          <Card>
            <h3 style={S.sec}>Rounds</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {g.rounds.map((r, i) => (
                <div key={i} style={{ background: r.isComplete ? CREAM : r.holesPlayed > 0 ? "#fff8e1" : "#f5f5f5", borderRadius: 8, padding: "8px 14px", textAlign: "center", flex: 1, minWidth: 60 }}>
                  <div style={{ fontSize: 11, color: "#888" }}>R{i + 1}</div>
                  {r.isComplete ? <div style={{ fontSize: 18, fontWeight: 700, color: G }}>{r.strokes}</div>
                    : r.holesPlayed > 0 ? <div style={{ fontSize: 18, fontWeight: 700, color: parClr(r.displayValue) }}>{r.displayValue || "—"}</div>
                    : <div style={{ fontSize: 18, color: "#ccc" }}>—</div>}
                  {r.holesPlayed > 0 && !r.isComplete && <div style={{ fontSize: 10, color: "#888" }}>{r.holesPlayed} holes</div>}
                </div>
              ))}
            </div>

            {/* Hole-by-hole scorecards */}
            {g.holeByHole.map((holes, ri) => {
              if (!holes.length) return null;
              return (
                <div key={ri} style={{ marginBottom: 16 }}>
                  <h3 style={{ ...S.sec, fontSize: 13 }}>Round {ri + 1} Scorecard</h3>
                  <HoleRow holes={holes} label="Out" startHole={1} />
                  <HoleRow holes={holes} label="In" startHole={10} />
                  <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 10, color: "#888", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px double #B8860B", fontSize: 8, textAlign: "center", lineHeight: "10px" }}></span> Eagle+</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "1.5px solid #dc3545", fontSize: 8, textAlign: "center", lineHeight: "11px" }}></span> Birdie</span>
                    <span style={{ color: "#555" }}>■ Par</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 2, border: "1.5px solid #666" }}></span> Bogey</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 2, border: "2px double #000" }}></span> Dbl+</span>
                  </div>
                </div>
              );
            })}
          </Card>
        ) : <Card><p style={{ color: "#999" }}>No data found for this golfer.</p></Card>}
        {EventPicker}<Toast msg={toast} />
      </Shell>
    );
  }

  if (showSplash || screen === "loading") return <SplashScreen eventName={eventName} fading={!showSplash} />;

  // ---- HOME ----
  if (screen === "home") return (
    <Shell>
      <Card>
        <h2 style={{ ...S.title, textAlign: "center", fontSize: 22, marginBottom: 8 }}>Welcome</h2>
        <p style={{ ...S.sub, textAlign: "center" }}>Create a new pool or join one with a code.</p>

        <button style={{ ...S.primary, marginBottom: 16 }}
          onClick={() => setScreen("setup")}>
          Create a Pool
        </button>

        <div style={{ borderTop: "1px solid #eee", paddingTop: 16 }}>
          <h3 style={{ ...S.sec, marginBottom: 8 }}>Join a Pool</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...S.input, letterSpacing: 4, textTransform: "uppercase", textAlign: "center", fontSize: 18, fontWeight: 700 }}
              placeholder="CODE"
              maxLength={6}
              value={joinInput}
              onChange={e => { setJoinInput(e.target.value.toUpperCase()); setJoinErr(""); }}
            />
            <button style={S.smallBtn} disabled={joinInput.length < 6}
              onClick={async () => {
                setJoinErr("");
                const pid = await lookupJoinCode(joinInput);
                if (pid) {
                  await enterPool(pid, uid);
                } else {
                  setJoinErr("No pool found with that code.");
                }
              }}>
              Join
            </button>
          </div>
          {joinErr && <p style={{ color: "#dc3545", fontSize: 12, marginTop: 6 }}>{joinErr}</p>}
        </div>
      </Card>
      <Toast msg={toast} />
    </Shell>
  );

  // ---- SETUP (Create Pool) ----
  if (screen === "setup") return (
    <Shell>
      <Card>
        <button style={{ ...S.ctrl, marginBottom: 10 }} onClick={() => setScreen("home")}>← Back</button>
        <h2 style={S.title}>Set Up Your Pool</h2>
        <p style={S.sub}>Enter everyone's name, then choose draft order below.</p>
        {names.map((n, i) => (
          <div key={i} style={{ ...S.row, gap: 4 }}>
            <span style={S.rowNum}>{i + 1}.</span>
            {!randomOrder && names.filter(x => x.trim()).length > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 1, marginRight: 2 }}>
                <button style={{ background: "none", border: "none", fontSize: 10, color: i === 0 ? "#ddd" : "#888", cursor: i === 0 ? "default" : "pointer", padding: "0 2px", lineHeight: 1 }}
                  disabled={i === 0}
                  onClick={() => { const u = [...names]; [u[i - 1], u[i]] = [u[i], u[i - 1]]; setNames(u); }}>▲</button>
                <button style={{ background: "none", border: "none", fontSize: 10, color: i === names.length - 1 ? "#ddd" : "#888", cursor: i === names.length - 1 ? "default" : "pointer", padding: "0 2px", lineHeight: 1 }}
                  disabled={i === names.length - 1}
                  onClick={() => { const u = [...names]; [u[i], u[i + 1]] = [u[i + 1], u[i]]; setNames(u); }}>▼</button>
              </div>
            )}
            <input style={S.input} placeholder="Name..." value={n}
              onChange={e => { const u = [...names]; u[i] = e.target.value; setNames(u); }} />
            {names.length > 2 && <button style={S.xBtn} onClick={() => setNames(names.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
        {names.length < 14 && <button style={S.dashed} onClick={() => setNames([...names, ""])}>+ Add Player</button>}

        {/* Draft order toggle */}
        <div style={{ margin: "16px 0 4px", display: "flex", gap: 8 }}>
          <button style={{
            flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
            border: randomOrder ? "2px solid " + G : "2px solid #e0e0e0",
            background: randomOrder ? CREAM : "white",
            fontSize: 13, fontWeight: randomOrder ? 700 : 400, color: randomOrder ? G : "#666",
            fontFamily: "'Georgia',serif",
          }} onClick={() => setRandomOrder(true)}>
            🎲 Random Order
          </button>
          <button style={{
            flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
            border: !randomOrder ? "2px solid " + G : "2px solid #e0e0e0",
            background: !randomOrder ? CREAM : "white",
            fontSize: 13, fontWeight: !randomOrder ? 700 : 400, color: !randomOrder ? G : "#666",
            fontFamily: "'Georgia',serif",
          }} onClick={() => setRandomOrder(false)}>
            📋 Manual Order
          </button>
        </div>
        {!randomOrder && <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>Use ▲▼ arrows to reorder. Player #1 picks first.</p>}

        <button style={{ ...S.primary, marginTop: 16, opacity: names.filter(n => n.trim()).length >= 2 ? 1 : 0.4 }}
          disabled={names.filter(n => n.trim()).length < 2}
          onClick={async () => {
            const valid = names.filter(n => n.trim()).map(n => n.trim());
            const ordered = randomOrder ? shuffle(valid) : valid;
            const claimsInit = {}; ordered.forEach(n => claimsInit[n] = null);

            // Create pool in Firebase with multi-tournament structure
            // No tournament created yet — admin will add tournaments via "New Tournament"
            const result = await createPool(uid, {
              players: ordered,
              claims: claimsInit,
              tournaments: {},
              activeTournamentId: null,
              draftOrderMode: randomOrder ? "random" : "manual",
            });

            if (!result) {
              notify("Failed to create pool");
              return;
            }

            // Enter the newly created pool
            await enterPool(result.poolId, uid);
            notify("Pool created! Share code: " + result.joinCode);
          }}>
          Create Pool
        </button>
        {isLoading && <p style={{ fontSize: 12, color: "#888", marginTop: 8, textAlign: "center" }}>Creating pool...</p>}
      </Card>
      <Toast msg={toast} />
    </Shell>
  );

  // ---- JOIN (Claim Name) ----
  if (screen === "join") return (
    <Shell joinCode={joinCode} onHome={leavePool}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ ...S.title, margin: 0 }}>Join Pool</h2>
          <button style={{ ...S.ctrl, fontSize: 11 }} onClick={leavePool}>← Home</button>
        </div>
        <div style={{ background: CREAM, border: "2px dashed " + GOLD, borderRadius: 10, padding: 16, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#888", letterSpacing: 2, marginBottom: 4 }}>POOL CODE</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: GD, letterSpacing: 6 }}>{joinCode}</div>
          <button style={{ ...S.ctrl, marginTop: 8, fontSize: 11 }} onClick={copyInviteLink}>Copy Invite Link</button>
        </div>

        <p style={{ ...S.sub, marginBottom: 12 }}>{claimedCount} of {players.length} players joined. Tap your name to claim it.</p>

        {players.map(name => {
          const claimedByMe = claims[name] === uid;
          const claimedByOther = claims[name] && claims[name] !== uid;
          return (
            <button
              key={name}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "14px 16px", marginBottom: 8,
                borderRadius: 10, cursor: "pointer",
                border: claimedByMe ? "2px solid " + G : "2px solid #e0e0e0",
                background: claimedByMe ? CREAM : "white",
                fontFamily: "'Georgia',serif", fontSize: 15,
              }}
              onClick={async () => {
                // Tapping your own name unclaims you
                if (claims[name] === uid) {
                  const ok = await claimPlayer(poolId, name, null);
                  if (ok) { setMyName(null); localStorage.removeItem("pga-pool-name"); notify("Unclaimed " + name); }
                  return;
                }
                // Unclaim previous name first if switching
                if (myName && myName !== name && claims[myName] === uid) {
                  await claimPlayer(poolId, myName, null);
                }
                const ok = await claimPlayer(poolId, name, uid);
                if (ok) {
                  setMyName(name);
                  localStorage.setItem("pga-pool-name", name);
                  notify("You are " + name + "!");
                } else {
                  notify("Couldn't claim name, try again");
                }
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: claimedByMe ? G : claimedByOther ? "#888" : GD }}>
                {photos[name] && <img src={photos[name]} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />}
                {name}
              </span>
              <span style={{ fontSize: 12, color: claimedByMe ? G : claimedByOther ? "#888" : "#999" }}>
                {claimedByMe ? "You ✓ tap to unclaim" : claimedByOther ? "Claimed — tap to reclaim" : "Tap to claim"}
              </span>
            </button>
          );
        })}

        {myName && (
          <>
            {!notifEnabled && typeof Notification !== "undefined" && Notification.permission !== "denied" && (
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 28 }}>🔔</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: 14, color: GD }}>Turn Notifications</h3>
                    <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Get notified when it's your turn to pick</p>
                  </div>
                  <button style={{ background: G, color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'Georgia',serif" }}
                    onClick={requestNotifications}>Enable</button>
                </div>
              </Card>
            )}
            {notifEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#e8f5e9", borderRadius: 8, marginBottom: 8, fontSize: 12, color: "#2e7d32" }}>
                <span>🔔</span> Notifications enabled — you'll be alerted when it's your turn
              </div>
            )}

            <Card>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, color: GD }}>Your Profile Photo</h3>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#888" }}>Add a photo for the score chart (optional)</p>
              <PhotoCapture playerName={myName} currentPhoto={photos[myName]} poolId={poolId} onSaved={() => notify("Photo saved!")} />
            </Card>

            {isAdmin && (
              <Card>
                <h3 style={{ margin: "0 0 8px", fontSize: 14, color: GD }}>Set Player Photos (Admin)</h3>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#888" }}>Add photos for players who skipped it</p>
                {players.filter(n => n !== myName).map(name => (
                  <div key={name} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f0f0f0" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: GD, marginBottom: 6 }}>{name}</div>
                    <PhotoCapture playerName={name} currentPhoto={photos[name]} poolId={poolId} onSaved={() => notify(name + "'s photo saved!")} />
                  </div>
                ))}
              </Card>
            )}

            {/* Show tournament selector if we have tournaments */}
            {Object.keys(tournaments).length > 0 && (
              <Card>
                <h3 style={{ margin: "0 0 8px", fontSize: 14, color: GD }}>Tournaments</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {Object.entries(tournaments).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)).map(([tid, t]) => (
                    <button key={tid} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                      border: tid === activeTournamentId ? "2px solid " + G : "1px solid #e0e0e0",
                      background: tid === activeTournamentId ? CREAM : "white",
                      fontFamily: "'Georgia',serif", fontSize: 13, textAlign: "left",
                    }} onClick={() => {
                      switchTournament(tid);
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, color: GD }}>{t.eventName || "Untitled"}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{t.draftDone ? "Draft complete" : "Drafting..."}</div>
                      </div>
                      <div style={{ fontSize: 11, color: tid === activeTournamentId ? G : "#999", fontWeight: 600 }}>
                        {tid === activeTournamentId ? "Active" : ""}
                      </div>
                    </button>
                  ))}
                </div>
                {isAdmin && (
                  <button style={{ ...S.dashed, marginTop: 8 }} onClick={() => setShowNewTournament(true)}>
                    + New Tournament
                  </button>
                )}
              </Card>
            )}

            {/* If no tournaments yet, prompt admin to create one */}
            {Object.keys(tournaments).length === 0 && isAdmin && (
              <Card>
                <h3 style={{ margin: "0 0 6px", fontSize: 14, color: GD }}>Get Started</h3>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#888" }}>Create your first tournament to start drafting.</p>
                <button style={S.primary} onClick={() => setShowNewTournament(true)}>
                  + New Tournament
                </button>
              </Card>
            )}

            {Object.keys(tournaments).length === 0 && !isAdmin && (
              <Card>
                <p style={{ margin: 0, fontSize: 13, color: "#888", textAlign: "center" }}>Waiting for the admin to create a tournament...</p>
              </Card>
            )}

            {Object.keys(tournaments).length > 0 && (
              <button style={{ ...S.primary, marginTop: 12 }}
                onClick={async () => {
                  if (viewingTournamentId && tournaments[viewingTournamentId]) {
                    const t = tournaments[viewingTournamentId];
                    if (t.draftDone) {
                      if (viewingTournamentId === activeTournamentId) {
                        const result = await fetchESPN(null);
                        if (result?.eventName && viewingTournamentId !== "legacy") {
                          await updateTournament(poolId, viewingTournamentId, { eventName: result.eventName });
                        }
                      }
                      setScreen("leaderboard");
                    } else {
                      setScreen("draft");
                    }
                  } else {
                    const result = await fetchESPN(null);
                    if (result || espnField.length > 0) {
                      setScreen(draftDone ? "leaderboard" : "draft");
                    } else if (!showEventPicker) {
                      setScreen(draftDone ? "leaderboard" : "draft");
                    }
                  }
                }}>
                {draftDone ? "Go to Leaderboard" : "Continue to Draft"}
              </button>
            )}
          </>
        )}
      </Card>
      {!isAdmin && (
        <Card>
          {!showClaimAdmin ? (
            <button style={{ background: "none", border: "none", fontSize: 12, color: "#999", cursor: "pointer", padding: 0, fontFamily: "'Georgia',serif", width: "100%", textAlign: "center" }}
              onClick={() => setShowClaimAdmin(true)}>
              Lost admin access? Claim admin role
            </button>
          ) : (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, color: GD }}>Claim Admin Role</h3>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#888" }}>Enter this pool's join code to become admin.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, fontFamily: "'Georgia',serif", letterSpacing: 2, textTransform: "uppercase" }}
                  placeholder="Pool code"
                  value={claimAdminCode}
                  onChange={e => { setClaimAdminCode(e.target.value.toUpperCase()); setClaimAdminErr(""); }}
                  maxLength={6}
                />
                <button style={{ ...S.primary, margin: 0, padding: "10px 16px" }}
                  onClick={async () => {
                    if (!claimAdminCode.trim()) return;
                    const result = await claimAdmin(poolId, uid, claimAdminCode.trim());
                    if (result.ok) {
                      notify("You are now the admin!");
                      setShowClaimAdmin(false);
                      setClaimAdminCode("");
                      setClaimAdminErr("");
                    } else {
                      setClaimAdminErr(result.error);
                    }
                  }}>
                  Claim
                </button>
              </div>
              {claimAdminErr && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#dc3545" }}>{claimAdminErr}</p>}
              <button style={{ background: "none", border: "none", fontSize: 11, color: "#999", cursor: "pointer", marginTop: 8, padding: 0, fontFamily: "'Georgia',serif" }}
                onClick={() => { setShowClaimAdmin(false); setClaimAdminCode(""); setClaimAdminErr(""); }}>
                Cancel
              </button>
            </div>
          )}
        </Card>
      )}
      {EventPicker}
      {showNewTournament && <NewTournamentModal />}
      <Toast msg={toast} />
    </Shell>
  );

  // ---- Tournament Nav Bar (shown on draft + leaderboard) ----
  const tournamentIds = Object.keys(tournaments);
  const TournamentNav = tournamentIds.length > 1 || (tournamentIds.length === 1 && isAdmin) ? (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 4, alignItems: "center" }}>
      {Object.entries(tournaments)
        .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
        .map(([tid, t]) => {
          const isViewing = tid === viewingTournamentId;
          const isActive = tid === activeTournamentId;
          return (
            <button key={tid} style={{
              padding: "6px 12px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap",
              border: isViewing ? "2px solid " + G : "1px solid #ddd",
              background: isViewing ? G : "white",
              color: isViewing ? "white" : GD,
              fontSize: 12, fontWeight: isViewing ? 700 : 400,
              fontFamily: "'Georgia',serif",
              display: "flex", alignItems: "center", gap: 4,
            }} onClick={() => switchTournament(tid)}>
              {isActive && <span style={{ fontSize: 8 }}>●</span>}
              {t.eventName || "Untitled"}
              {t.draftDone ? "" : " 🔄"}
            </button>
          );
        })}
      {isAdmin && (
        <button style={{
          padding: "6px 12px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap",
          border: "2px dashed " + G, background: "transparent", color: G,
          fontSize: 12, fontWeight: 600, fontFamily: "'Georgia',serif",
        }} onClick={() => setShowNewTournament(true)}>
          + New
        </button>
      )}
    </div>
  ) : null;

  // ---- DRAFT ----
  if (screen === "draft") {
    const allPicked = Object.values(picks).flat();
    const allPickedNorm = allPicked.map(normName);
    const available = espnField.map(f => f.name).filter(g => !allPickedNorm.includes(normName(g)));
    const filtered = search ? available.filter(g => g.toLowerCase().includes(search.toLowerCase())) : available;
    const round = Math.min(Math.floor(pickIdx / players.length) + 1, PICKS);
    const total = draftOrder.length;
    const displayPickIdx = Math.min(pickIdx, total);

    const doPick = (golfer) => {
      if (!canPick) { notify("It's not your turn!"); return; }
      if (allPickedNorm.includes(normName(golfer))) { notify("Already picked!"); return; }
      const u = { ...picks }; u[drafter] = [...(u[drafter] || []), golfer];
      const next = pickIdx + 1;
      const done = next >= total;
      setPicks(u); setPickIdx(next); setSearch("");
      if (done) setDraftDone(true);
      saveState({ picks: u, pickIdx: next, draftDone: done });
      notify(done ? "Draft complete!" : drafter + " picked " + golfer);
    };

    const allPickedForEdit = Object.values(picks).flat();
    const allPickedForEditNorm = allPickedForEdit.map(normName);
    const EditPicksModal = editingPicks ? (() => {
      const { player, pickIndex } = editingPicks;
      const currentGolfer = (picks[player] || [])[pickIndex];
      const availableForSwap = espnField.map(f => f.name).filter(g => !allPickedForEditNorm.includes(normName(g)) || normName(g) === normName(currentGolfer));
      const filteredSwap = editSearch ? availableForSwap.filter(g => g.toLowerCase().includes(editSearch.toLowerCase())) : availableForSwap;
      return (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 440 }}>
            <h3 style={S.title}>Edit Pick — {player}</h3>
            <p style={S.sub}>Replacing: <strong>{currentGolfer}</strong></p>
            <input style={S.searchInput} placeholder="Search golfers..." value={editSearch} onChange={e => setEditSearch(e.target.value)} autoFocus />
            <div style={{ maxHeight: 300, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {filteredSwap.map(golfer => (
                <button key={golfer} style={{ ...S.golferBtn, background: golfer === currentGolfer ? CREAM : "white", fontWeight: golfer === currentGolfer ? 700 : 400 }}
                  onClick={() => {
                    const u = { ...picks };
                    const arr = [...(u[player] || [])];
                    arr[pickIndex] = golfer;
                    u[player] = arr;
                    setPicks(u);
                    saveState({ picks: u });
                    setEditingPicks(null);
                    setEditSearch("");
                    notify(`Swapped ${currentGolfer} → ${golfer} for ${player}`);
                  }}>{golfer}</button>
              ))}
            </div>
            <button style={{ ...S.ctrl, marginTop: 10, width: "100%" }} onClick={() => { setEditingPicks(null); setEditSearch(""); }}>Cancel</button>
          </div>
        </div>
      );
    })() : null;

    if (draftDone) return (
      <Shell joinCode={joinCode} onHome={leavePool}>
        {TournamentNav}
        <Card>
          <h2 style={{ ...S.title, color: G, textAlign: "center" }}>Draft Complete!</h2>
          <p style={{ ...S.sub, textAlign: "center", fontWeight: 600 }}>{eventName}</p>
          {viewingTournamentId && viewingTournamentId !== activeTournamentId && isAdmin && (
            <button style={{ ...S.smallBtn, width: "100%", marginBottom: 10, background: GOLD, color: GD }}
              onClick={async () => {
                await updatePool(poolId, { activeTournamentId: viewingTournamentId });
                setActiveTournamentId(viewingTournamentId);
                notify("Set as active tournament");
              }}>
              Set as Active Tournament
            </button>
          )}
          {players.map(p => (
            <div key={p} style={S.teamCard}>
              <div style={S.teamName}>{p} {claims[p] === uid && <span style={{ fontSize: 11, color: GOLD }}>(You)</span>}</div>
              {(picks[p] || []).map((g, i) => (
                <div key={g} style={{ fontSize: 13, padding: "3px 0", color: "#333", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span><span style={{ color: G, fontWeight: 700, fontSize: 12, marginRight: 6 }}>#{i + 1}</span>{g}</span>
                  {isAdmin && <button style={{ background: "none", border: "none", fontSize: 11, color: "#999", cursor: "pointer", padding: "2px 6px" }} onClick={() => setEditingPicks({ player: p, pickIndex: i })}>✎</button>}
                </div>
              ))}
            </div>
          ))}
          <button style={S.primary} onClick={() => {
            if (viewingTournamentId === activeTournamentId) {
              setScreen("leaderboard");
            } else {
              // Switch to active tournament's leaderboard
              if (activeTournamentId && tournaments[activeTournamentId]) {
                switchTournament(activeTournamentId);
                setScreen("leaderboard");
              } else {
                setScreen("leaderboard");
              }
            }
          }}>Go to Leaderboard</button>
        </Card>
        {EditPicksModal}
        {showNewTournament && NewTournamentModal}
        {EventPicker}<Toast msg={toast} />
      </Shell>
    );

    return (
      <Shell joinCode={joinCode} onHome={leavePool}>
        {TournamentNav}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={S.badge}>Round {round}/{PICKS}</span>
            <span style={{ fontSize: 12, color: "#999" }}>Pick {displayPickIdx}/{total}</span>
          </div>
          <div style={S.bar}><div style={{ ...S.barFill, width: (displayPickIdx / total) * 100 + "%" }} /></div>
          {eventName && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#666" }}>{eventName}</p>}
        </Card>

        <div style={S.pickerCard}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, fontWeight: 700 }}>NOW PICKING</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "white", margin: "4px 0" }}>{drafter}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Pick {(picks[drafter]?.length || 0) + 1} of {PICKS}</div>
          {/* Authorization message */}
          {!canPick && (
            <div style={{ marginTop: 8, padding: "6px 12px", background: "rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
              Waiting for {drafter} to pick...
              {!notifEnabled && typeof Notification !== "undefined" && Notification.permission !== "denied" && (
                <button onClick={requestNotifications} style={{ display: "block", margin: "6px auto 0", background: GOLD, color: GD, border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Georgia',serif" }}>
                  🔔 Enable turn notifications
                </button>
              )}
            </div>
          )}
          {canPick && isAdmin && claims[drafter] !== uid && (
            <div style={{ marginTop: 8, padding: "6px 12px", background: hexToRgba(GOLD, 0.15), borderRadius: 8, fontSize: 12, color: GOLD }}>
              Admin: picking on behalf of {drafter}
            </div>
          )}
        </div>

        <Card>
          <h3 style={S.sec}>Snake Draft Order</h3>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
            {Array.from({ length: PICKS }).map((_, ri) => (
              <div key={ri} style={{ flex: 1, minWidth: 72 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: G, textAlign: "center", marginBottom: 3 }}>R{ri + 1} {ri % 2 === 1 ? "↑" : "↓"}</div>
                {draftOrder.slice(ri * players.length, (ri + 1) * players.length).map((p, pi) => {
                  const idx = ri * players.length + pi; const done = idx < pickIdx, active = idx === pickIdx;
                  return <div key={ri + "-" + pi} style={{ padding: "4px 6px", borderRadius: 5, fontSize: 11, textAlign: "center", marginBottom: 2, background: active ? GOLD : done ? "#e8e8e8" : "white", color: active ? "#000" : done ? "#aaa" : "#333", fontWeight: active ? 700 : 400, border: active ? "2px solid " + G : "1px solid #e0e0e0" }}>{p}{done && " ✓"}</div>;
                })}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 style={S.sec}>Teams So Far</h3>
          {players.map(p => (<div key={p} style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: GD, minWidth: 70 }}>{p} {claims[p] === uid && <span style={{ color: GOLD, fontSize: 10 }}>(You)</span>}</span>
            <span style={{ color: "#555" }}>{(picks[p] || []).join(", ") || "—"}</span></div>))}
        </Card>

        {canPick && (
          <Card>
            <h3 style={S.sec}>Available Golfers ({available.length})</h3>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input style={{ ...S.searchInput, flex: 1, marginBottom: 0 }} placeholder="Search golfers..." value={search} onChange={e => setSearch(e.target.value)} />
              {available.length > 0 && (
                <button style={{ ...S.smallBtn, whiteSpace: "nowrap", fontSize: 12 }}
                  onClick={() => {
                    const pick = available[Math.floor(Math.random() * available.length)];
                    setPendingPick(pick);
                  }}>
                  🎲 Random
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, maxHeight: 350, overflowY: "auto" }}>
              {filtered.map(golfer => (<button key={golfer} style={S.golferBtn} onClick={() => setPendingPick(golfer)}>{golfer}</button>))}
            </div>
            {espnField.length === 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button style={{ ...S.primary, flex: 1, fontSize: 13, padding: "10px 16px", minWidth: 120 }} onClick={() => fetchESPN(selectedEvent)} disabled={isLoading}>{isLoading ? "Fetching..." : "Fetch from ESPN"}</button>
                {isAdmin && <button style={{ ...S.smallBtn, fontSize: 13, padding: "10px 16px" }} onClick={fetchCalendar} disabled={calendarLoading}>{calendarLoading ? "..." : "Upcoming"}</button>}
                {isAdmin && <button style={{ ...S.smallBtn, fontSize: 13, padding: "10px 16px" }} onClick={() => setShowImportField(true)}>Import</button>}
              </div>
            )}
          </Card>
        )}

        {isAdmin && pickIdx > 0 && <button style={S.undo} onClick={() => {
          const prev = pickIdx - 1, pd = draftOrder[prev];
          const u = { ...picks }; u[pd] = (u[pd] || []).slice(0, -1);
          setPicks(u); setPickIdx(prev); setDraftDone(false);
          saveState({ picks: u, pickIdx: prev, draftDone: false });
          notify("Undone");
        }}>↩ Undo Last Pick</button>}
        {EventPicker}
        {showCalendar && (
          <div style={S.overlay}>
            <div style={{ ...S.modal, maxWidth: 440 }}>
              <h3 style={S.title}>Upcoming Tournaments</h3>
              <p style={S.sub}>Select a tournament. If the field isn't on ESPN yet, you can import one.</p>
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                {calendarEvents.map(ev => {
                  const start = new Date(ev.startDate);
                  const dateStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  const isCurrent = ev.isThisWeek;
                  return (
                    <button key={ev.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "12px 14px", marginBottom: 6,
                      borderRadius: 10, cursor: "pointer",
                      border: isCurrent ? "2px solid " + G : "2px solid #e8e8e8",
                      background: isCurrent ? CREAM : "white",
                      fontFamily: "'Georgia',serif", fontSize: 14, textAlign: "left",
                    }} onClick={() => selectTournament(ev)}>
                      <div>
                        <div style={{ fontWeight: 700, color: GD }}>{ev.name}</div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{dateStr}</div>
                      </div>
                      <div style={{ fontSize: 11, color: ev.hasField ? G : "#999", fontWeight: 600 }}>
                        {ev.hasField ? "Field ready" : "Import needed"}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button style={{ ...S.ctrl, marginTop: 8, width: "100%" }} onClick={() => setShowCalendar(false)}>Cancel</button>
            </div>
          </div>
        )}
        {showImportField && (
          <div style={S.overlay}>
            <div style={{ ...S.modal, maxWidth: 500 }}>
              <h3 style={S.title}>Import Field</h3>
              <p style={S.sub}>Paste golfer names, one per line. Supports "Lastname, Firstname" format (auto-converts).</p>
              {!eventName && (
                <input
                  style={{ ...S.input, marginBottom: 8 }}
                  placeholder="Tournament name (e.g. The Masters)"
                  id="import-event-name"
                />
              )}
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={"Scheffler, Scottie\nMcIlroy, Rory\nRahm, Jon\n..."}
                style={{ width: "100%", minHeight: 200, padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 13, fontFamily: "'Georgia',serif", resize: "vertical", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>
                {importText.split("\n").filter(l => l.trim()).length} golfers detected
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button style={S.primary} onClick={() => {
                    const nameInput = document.getElementById("import-event-name");
                    if (nameInput?.value?.trim() && !eventName) {
                      setEventName(nameInput.value.trim());
                      if (poolId) updatePool(poolId, { eventName: nameInput.value.trim() });
                    }
                    importField(importText);
                  }}
                  disabled={importText.split("\n").filter(l => l.trim()).length < 2}>
                  Import {importText.split("\n").filter(l => l.trim()).length} Golfers
                </button>
                <button style={S.ctrl} onClick={() => { setShowImportField(false); setImportText(""); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {showNewTournament && NewTournamentModal}
        {pendingPick && (
          <div style={S.overlay}>
            <div style={{ ...S.modal, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>⛳</div>
              <h3 style={{ ...S.title, marginBottom: 4 }}>Confirm Pick</h3>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: "#888" }}>{drafter} is drafting:</p>
              <p style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700, color: GD }}>{pendingPick}</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...S.primary, flex: 1 }}
                  onClick={() => { doPick(pendingPick); setPendingPick(null); }}>
                  Confirm
                </button>
                <button style={{ ...S.ctrl, flex: 1 }}
                  onClick={() => setPendingPick(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        <Toast msg={toast} />
      </Shell>
    );
  }

  // ---- LEADERBOARD ----
  if (screen === "leaderboard") return (
    <Shell joinCode={joinCode} onHome={leavePool}>
      {TournamentNav}
      <div style={S.eventBanner}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, fontWeight: 700 }}>
          {tournamentDone ? "FINAL" : espnField.some(f => f.holesPlayed > 0) ? "LIVE" : "LEADERBOARD"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>{eventName}</div>
        {eventDetail && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{eventDetail}</div>}
      </div>
      {viewingTournamentId && viewingTournamentId !== activeTournamentId && isAdmin && (
        <button style={{ ...S.smallBtn, width: "100%", marginBottom: 10, background: GOLD, color: GD }}
          onClick={async () => {
            await updatePool(poolId, { activeTournamentId: viewingTournamentId });
            setActiveTournamentId(viewingTournamentId);
            notify("Set as active tournament — refresh to load live scores");
          }}>
          Set as Active Tournament
        </button>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button style={{ ...S.ctrl, opacity: isLoading ? 0.5 : 1 }} onClick={() => fetchESPN(selectedEvent)} disabled={isLoading}>
          {isLoading ? "..." : "Refresh"}
        </button>
        <button style={{ ...S.ctrl, background: showFullLB ? G : "white", color: showFullLB ? "white" : GD }} onClick={() => setShowFullLB(!showFullLB)}>
          {showFullLB ? "Pool View" : "Tournament"}
        </button>
        <button style={{ ...S.ctrl, background: showChart ? G : "white", color: showChart ? "white" : GD }} onClick={() => setShowChart(!showChart)}>Chart</button>
        <button style={{ ...S.ctrl, background: showPredictions ? G : "white", color: showPredictions ? "white" : GD }} onClick={() => setShowPredictions(!showPredictions)}>Predictions</button>
        <button style={S.ctrl} onClick={() => setShowRules(!showRules)}>Rules</button>
        <button style={S.ctrl} onClick={() => setScreen("draft")}>Draft</button>
        <button style={S.ctrl} onClick={copyInviteLink}>Share</button>
        <button style={S.ctrl} onClick={leavePool}>Leave</button>
        {isAdmin && (
          <button style={{ ...S.ctrl, color: "#dc3545", borderColor: "#dc3545" }}
            onClick={() => { if (confirm("Delete this pool? This cannot be undone.")) {
              savePool(poolId, null);
              leavePool();
            } }}>Delete</button>
        )}
      </div>
      {lastUpdated && <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>Updated: {lastUpdated}</div>}
      {fetchErr && <div style={{ fontSize: 12, color: "#dc3545", marginBottom: 8 }}>{fetchErr}</div>}

      {showRules && (
        <Card>
          <h3 style={S.sec}>Scoring Rules</h3>
          <p style={S.rule}>Your <strong>best {BEST_OF} of {PICKS}</strong> golfers count (lowest combined to-par score).</p>
          <p style={S.rule}>If your golfer <strong>wins the tournament</strong>: −5 from your total.</p>
          <p style={S.rule}>Missed cut golfers get <strong>+8 per missed round</strong> (80 on par 72).</p>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #eee", display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
            <span><strong style={{ color: G }}>68</strong> = finished round</span>
            <span><strong style={{ color: "#dc3545" }}>−3</strong> = under par</span>
            <span><strong style={{ color: "#333" }}>+2</strong> = over par</span>
          </div>
        </Card>
      )}
      {tournamentWinner && <div style={S.winnerBanner}>Champion: {tournamentWinner}</div>}

      {showPredictions && (
        <Card>
          <h3 style={S.sec}>Prediction Market Analysis</h3>
          {kalshiLoading ? (
            <div style={{ textAlign: "center", padding: 16, color: "#aaa" }}>Loading prediction data...</div>
          ) : !kalshiData?.available ? (
            <div style={{ textAlign: "center", padding: 16, color: "#999" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>N/A</div>
              <div style={{ fontSize: 13 }}>Prediction market data not yet available for this tournament.</div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>Markets typically open 1-2 weeks before the event.</div>
            </div>
          ) : poolLB.length > 0 ? (() => {
            // Calculate risk/safety stats for each player
            const playerStats = poolLB.map(player => {
              const golferOdds = player.golfers.map(g => {
                const odds = getKalshiOdds(g.name);
                return { name: g.name, odds, cutPct: odds?.cut ?? null, status: g.status };
              });
              const withCutData = golferOdds.filter(g => g.cutPct != null);
              const avgCutPct = withCutData.length ? Math.round(withCutData.reduce((s, g) => s + g.cutPct, 0) / withCutData.length) : null;
              // Expected missed cuts = sum of (1 - cutPct/100) for all golfers
              const expectedMC = withCutData.length ? withCutData.reduce((s, g) => s + (1 - g.cutPct / 100), 0) : null;
              // Probability all make the cut = product of individual cut probabilities
              const allMakeCut = withCutData.length === player.golfers.length
                ? Math.round(withCutData.reduce((p, g) => p * (g.cutPct / 100), 1) * 100)
                : null;
              // P(at least 4 of 6 make the cut) — enumerate all combos of 4+
              // For n golfers with probs p[i], sum over all subsets of size >= BEST_OF
              const atLeast4Cut = (() => {
                const probs = golferOdds.map(g => g.cutPct != null ? g.cutPct / 100 : null);
                if (probs.some(p => p == null)) return null;
                const n = probs.length;
                let total = 0;
                // Iterate over all 2^n subsets, count those with size >= BEST_OF
                for (let mask = 0; mask < (1 << n); mask++) {
                  let bits = 0;
                  for (let i = 0; i < n; i++) if (mask & (1 << i)) bits++;
                  if (bits < BEST_OF) continue;
                  let prob = 1;
                  for (let i = 0; i < n; i++) {
                    prob *= (mask & (1 << i)) ? probs[i] : (1 - probs[i]);
                  }
                  total += prob;
                }
                return Math.round(total * 100);
              })();
              // Average top 10 probability
              const withTop10 = golferOdds.filter(g => g.odds?.top10 != null);
              const avgTop10 = withTop10.length ? Math.round(withTop10.reduce((s, g) => s + g.odds.top10, 0) / withTop10.length) : null;
              return { name: player.name, golferOdds, avgCutPct, expectedMC, allMakeCut, atLeast4Cut, avgTop10, hasData: withCutData.length > 0 };
            }).filter(p => p.hasData);

            // Sort: safest = highest avg cut%, riskiest = lowest
            const bySafety = [...playerStats].sort((a, b) => (b.avgCutPct || 0) - (a.avgCutPct || 0));

            return (
              <>
                {/* Safest to Riskiest ranking */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: GD, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    Safest to Riskiest Picks
                  </div>
                  {bySafety.map((p, idx) => {
                    const safetyColor = p.avgCutPct >= 75 ? "#4CAF50" : p.avgCutPct >= 55 ? "#FF9800" : "#dc3545";
                    const isMe = claims[p.name] === uid;
                    return (
                      <div key={p.name} style={{ display: "flex", alignItems: "center", padding: "10px 8px", borderBottom: "1px solid #f0f0f0", gap: 10 }}>
                        <div style={{ width: 24, fontSize: 14, fontWeight: 700, color: idx === 0 ? "#4CAF50" : idx === bySafety.length - 1 ? "#dc3545" : "#888", textAlign: "center" }}>
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: GD }}>
                            {p.name} {isMe && <span style={{ fontSize: 10, color: GOLD }}>(You)</span>}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 3, fontSize: 11, color: "#888" }}>
                            {p.golferOdds.map(g => (
                              <span key={g.name} style={{ color: g.cutPct != null ? (g.cutPct >= 70 ? "#4CAF50" : g.cutPct >= 40 ? "#FF9800" : "#dc3545") : "#ccc" }}>
                                {g.name.split(" ").pop()} {g.cutPct != null ? g.cutPct + "%" : "N/A"}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", minWidth: 70 }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: safetyColor }}>{p.avgCutPct}%</div>
                          <div style={{ fontSize: 10, color: "#888" }}>avg cut</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Key stats comparison */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {bySafety.map(p => {
                    const isMe = claims[p.name] === uid;
                    return (
                      <div key={p.name} style={{ background: "#f8f9fa", borderRadius: 10, padding: 12, textAlign: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: GD, marginBottom: 8 }}>
                          {p.name} {isMe && <span style={{ fontSize: 9, color: GOLD }}>(You)</span>}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-around", gap: 4 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#888" }}>4+ Cut</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: p.atLeast4Cut != null ? (p.atLeast4Cut >= 70 ? "#4CAF50" : p.atLeast4Cut >= 40 ? "#FF9800" : "#dc3545") : "#ccc" }}>
                              {p.atLeast4Cut != null ? p.atLeast4Cut + "%" : "N/A"}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#888" }}>All 6 Cut</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: p.allMakeCut != null ? (p.allMakeCut >= 40 ? "#4CAF50" : p.allMakeCut >= 15 ? "#FF9800" : "#dc3545") : "#ccc" }}>
                              {p.allMakeCut != null ? p.allMakeCut + "%" : "N/A"}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#888" }}>Exp. MCs</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: p.expectedMC != null ? (p.expectedMC <= 0.5 ? "#4CAF50" : p.expectedMC <= 1.5 ? "#FF9800" : "#dc3545") : "#ccc" }}>
                              {p.expectedMC != null ? p.expectedMC.toFixed(1) : "N/A"}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#888" }}>Avg T10</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: G }}>
                              {p.avgTop10 != null ? p.avgTop10 + "%" : "N/A"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: 10, color: "#bbb", textAlign: "center" }}>
                  Implied probabilities from {kalshiData?.source === "espn" ? "ESPN / sportsbook" : "Kalshi"} odds. Tap a golfer for full breakdown.
                </div>
              </>
            );
          })() : (
            <div style={{ textAlign: "center", padding: 16, color: "#999", fontSize: 13 }}>Complete the draft to see prediction analysis.</div>
          )}
        </Card>
      )}

      {showChart && poolLB.length > 0 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 998, background: "white", display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, color: GD }}>Score Tracker</h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>{eventName}</p>
            </div>
            <button style={{ ...S.ctrl, fontSize: 14, padding: "8px 16px" }} onClick={() => setShowChart(false)}>✕ Close</button>
          </div>
          <div style={{ flex: 1, padding: "8px 4px" }}>
            <PositionChart poolLB={poolLB} uid={uid} claims={claims} photos={photos} fullScreen />
          </div>
        </div>
      )}

      {showFullLB ? (
        <Card>
          <h3 style={S.sec}>Tournament Leaderboard</h3>
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            {espnField.map((g, i) => {
              const isPicked = Object.values(picks).flat().some(p => normName(p) === normName(g.name));
              return (
                <div key={g.name} style={{ display: "flex", alignItems: "center", padding: "6px 4px", borderBottom: "1px solid #f0f0f0", background: isPicked ? hexToRgba(G, 0.06) : "transparent", cursor: "pointer" }} onClick={() => setGolferDetail(g.name)}>
                  <div style={{ width: 30, fontSize: 13, fontWeight: 600, color: "#888" }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: isPicked ? 700 : 400, color: isPicked ? GD : "#333" }}>{g.name} {isPicked && "⛳"}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {g.rounds.map((r, ri) => (<span key={ri} style={{ fontSize: 12, minWidth: 28, textAlign: "center", fontWeight: 600, color: r.isComplete ? G : r.holesPlayed > 0 ? parClr(r.displayValue) : "#ccc" }}>{r.isComplete ? r.strokes : r.holesPlayed > 0 ? (r.displayValue || "—") : "—"}</span>))}
                    <span style={{ fontSize: 14, fontWeight: 700, color: parClr(g.scoreToPar), minWidth: 36, textAlign: "right" }}>{g.scoreToPar}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Tap a golfer for their scorecard. ⛳ = in your pool.</p>
        </Card>
      ) : (<>
        {/* Masters-style scoreboard */}
        <div style={{ background: BOARD_GREEN, borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", border: "3px solid " + hexToRgba(G, 0.4) + "", marginBottom: 12 }}>
          <div style={{ background: BOARD_DARK, padding: "10px 16px", textAlign: "center", borderBottom: "2px solid " + hexToRgba(G, 0.4) + "" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: BOARD_YELLOW, letterSpacing: 6, fontFamily: "'Georgia',serif", textTransform: "uppercase" }}>LEADERS</div>
          </div>
          <div style={{ display: "flex", padding: "8px 12px 4px", borderBottom: "1px solid rgba(255,255,255,0.15)", alignItems: "center" }}>
            <div style={{ width: 28, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", textAlign: "center" }}></div>
            <div style={{ flex: 2, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>Player</div>
            {[1, 2, 3, 4].map(r => <div key={r} style={{ flex: 0.45, textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>R{r}</div>)}
            <div style={{ flex: 0.6, textAlign: "right", fontSize: 10, fontWeight: 700, color: BOARD_YELLOW, letterSpacing: 1 }}>TOTAL</div>
          </div>
          {poolLB.map((e, idx) => {
            const isExp = expanded === e.name;
            const isMe = claims[e.name] === uid;
            const scoreColor = e.hasScores ? (e.combinedPar < 0 ? BOARD_RED : e.combinedPar > 0 ? "rgba(255,255,255,0.9)" : BOARD_YELLOW) : "rgba(255,255,255,0.3)";
            return (
              <div key={e.name}>
                <div onClick={() => setExpanded(isExp ? null : e.name)} style={{
                  display: "flex", alignItems: "center", padding: "8px 12px", cursor: "pointer",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  background: isExp ? "rgba(255,255,255,0.06)" : idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.1)",
                }}>
                  <div style={{ width: 28, fontSize: 14, fontWeight: 700, color: BOARD_YELLOW, textAlign: "center" }}>{idx + 1}</div>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.95)", fontFamily: "'Georgia',serif", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {e.name} {isMe && <span style={{ fontSize: 10, color: GOLD }}>(You)</span>}
                    </div>
                    {!isExp && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{e.counting.join(", ")}</div>}
                  </div>
                  {[0, 1, 2, 3].map(ri => {
                    const rs = e.roundScores[ri];
                    const inProg = e.roundInProgress[ri];
                    const clr = rs == null ? "rgba(255,255,255,0.15)" : inProg ? (rs < 0 ? BOARD_RED : rs > 0 ? "rgba(255,255,255,0.6)" : BOARD_YELLOW) : "rgba(255,255,255,0.85)";
                    return <div key={ri} style={{ flex: 0.45, textAlign: "center", fontSize: 12, fontWeight: 600, color: clr }}>{rs != null ? fmtPar(rs) : "—"}</div>;
                  })}
                  <div style={{ flex: 0.6, textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor, fontFamily: "'Georgia',serif" }}>
                      {e.hasScores ? fmtPar(e.combinedPar) : "—"}
                    </div>
                    {e.hasWinner && <div style={{ fontSize: 9, color: BOARD_YELLOW, fontWeight: 700 }}>−5 BONUS</div>}
                  </div>
                </div>
                {isExp && (
                  <div style={{ background: "rgba(0,0,0,0.15)", padding: "6px 12px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }} onClick={ev => ev.stopPropagation()}>
                    {e.golfers.map(g => {
                      const ct = e.counting.includes(g.name);
                      const gScoreClr = g.found ? (g.parNum < 0 ? BOARD_RED : g.parNum > 0 ? "rgba(255,255,255,0.7)" : BOARD_YELLOW) : "rgba(255,255,255,0.2)";
                      return (
                        <div key={g.name} style={{
                          display: "flex", alignItems: "center", padding: "4px 0", cursor: "pointer",
                          opacity: ct ? 1 : 0.45,
                        }} onClick={() => setGolferDetail(g.name)}>
                          <div style={{ width: 28, fontSize: 11, color: ct ? BOARD_YELLOW : "rgba(255,255,255,0.3)", textAlign: "center" }}>{ct ? "●" : "○"}</div>
                          <div style={{ flex: 2, fontSize: 12, fontWeight: ct ? 700 : 400, color: ct ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.3 }}>
                            {g.name}{g.isWinner && " ★"}{g.status === "cut" && <span style={{ marginLeft: 4, fontSize: 9, color: BOARD_RED, fontWeight: 700 }}>MC</span>}
                          </div>
                          {[0, 1, 2, 3].map(r => {
                            const rd = g.rounds?.[r];
                            if (!rd) return <div key={r} style={{ flex: 0.45, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.15)" }}>—</div>;
                            const rdColor = rd.isComplete ? "rgba(255,255,255,0.85)" : rd.holesPlayed > 0 ? (parseInt(rd.displayValue) < 0 ? BOARD_RED : parseInt(rd.displayValue) > 0 ? "rgba(255,255,255,0.6)" : BOARD_YELLOW) : "rgba(255,255,255,0.15)";
                            return <div key={r} style={{ flex: 0.45, textAlign: "center", fontSize: 12, fontWeight: 600, color: rdColor }}>
                              {rd.isComplete ? rd.strokes : rd.holesPlayed > 0 ? (rd.displayValue || "—") : "—"}
                            </div>;
                          })}
                          <div style={{ flex: 0.6, textAlign: "right", fontSize: 13, fontWeight: 700, color: gScoreClr }}>{g.found ? g.scoreToPar : "—"}</div>
                        </div>
                      );
                    })}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 6, marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
                      Best {BEST_OF} = <strong style={{ color: e.combinedPar - (e.hasWinner ? WINNER_BONUS : 0) < 0 ? BOARD_RED : BOARD_YELLOW }}>{fmtPar(e.combinedPar - (e.hasWinner ? WINNER_BONUS : 0))}</strong>
                      {e.hasWinner && <span style={{ color: BOARD_YELLOW }}> + bonus (−5) = <strong>{fmtPar(e.combinedPar)}</strong></span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {poolLB.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Complete the draft, then refresh scores.</div>}
        </div>
      </>)}
      {EventPicker}
      {showNewTournament && NewTournamentModal}
      <Toast msg={toast} />
    </Shell>
  );

  return <Shell><p>Something went wrong.</p></Shell>;
}

// ============================================================
// CHART_COLORS are now dynamic via CHART_COLORS_DYN (set by applyTheme)

function PositionChart({ poolLB, uid, claims, photos = {}, fullScreen }) {
  const numPlayers = poolLB.length;
  const [animT, setAnimT] = useState(-1); // -1 = show all, 0..numRounds-1 = continuous progress
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(null);

  // Compute cumulative scores after each round
  const { roundLabels, scoreData, scoreMin, scoreMax } = useMemo(() => {
    const rl = [], sd = {};
    poolLB.forEach(p => { sd[p.name] = []; });
    let sMin = Infinity, sMax = -Infinity;
    for (let ri = 0; ri < 4; ri++) {
      const hasData = poolLB.some(p => p.roundScores[ri] != null);
      if (!hasData) break;
      rl.push("R" + (ri + 1));
      poolLB.forEach(p => {
        let cum = 0, hasAny = false;
        for (let r = 0; r <= ri; r++) {
          if (p.roundScores[r] != null) { cum += p.roundScores[r]; hasAny = true; }
        }
        const val = hasAny ? cum : null;
        sd[p.name].push(val);
        if (val != null) { sMin = Math.min(sMin, val); sMax = Math.max(sMax, val); }
      });
    }
    if (sMin === sMax) { sMin -= 2; sMax += 2; }
    else { const pad = Math.max(1, Math.ceil((sMax - sMin) * 0.12)); sMin -= pad; sMax += pad; }
    return { roundLabels: rl, scoreData: sd, scoreMin: sMin, scoreMax: sMax };
  }, [poolLB]);

  const numRounds = roundLabels.length;

  // Clean up on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Smooth animation using requestAnimationFrame
  const play = useCallback(() => {
    if (numRounds <= 1) return;
    setPlaying(true);
    const duration = numRounds * 1800; // ms total
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-in-out
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const t = eased * (numRounds - 1);
      setAnimT(t);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Hold on final, then show all
        setTimeout(() => { setAnimT(-1); setPlaying(false); }, 1000);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [numRounds]);

  if (numPlayers === 0 || numRounds === 0) return null;

  // SVG dimensions
  const W = fullScreen ? 700 : 340, H = fullScreen ? 500 : 240;
  const padL = fullScreen ? 48 : 36, padR = fullScreen ? 30 : 20, padT = fullScreen ? 30 : 20, padB = fullScreen ? 50 : 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const getX = (ri) => padL + (numRounds > 1 ? ri * (chartW / (numRounds - 1)) : chartW / 2);
  const getY = (score) => padT + ((score - scoreMin) / (scoreMax - scoreMin)) * chartH;

  // Interpolate a player's score at continuous time t
  const interpScore = (scores, t) => {
    const lo = Math.floor(t), hi = Math.ceil(t);
    const sLo = scores[lo], sHi = scores[hi];
    if (sLo == null) return sHi;
    if (sHi == null || lo === hi) return sLo;
    const frac = t - lo;
    return sLo + (sHi - sLo) * frac;
  };

  const isAnimating = animT >= 0;
  const showUpTo = isAnimating ? animT : numRounds - 1;

  // Y-axis tick marks
  const yTicks = [];
  const tickMin = Math.ceil(scoreMin);
  const tickMax = Math.floor(scoreMax);
  const range = tickMax - tickMin;
  const tickInterval = range <= 8 ? 1 : range <= 16 ? 2 : range <= 30 ? 5 : 10;
  for (let v = tickMin; v <= tickMax; v++) {
    if (v % tickInterval === 0) yTicks.push(v);
  }
  if (scoreMin <= 0 && scoreMax >= 0 && !yTicks.includes(0)) yTicks.push(0);
  yTicks.sort((a, b) => a - b);

  const Wrap = fullScreen ? "div" : Card;

  return (
    <Wrap>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, padding: fullScreen ? "0 12px" : 0 }}>
        <div>
          {!fullScreen && <h3 style={{ margin: 0, fontSize: 15, color: GD }}>Score Tracker</h3>}
          <p style={{ margin: "2px 0 0", fontSize: fullScreen ? 13 : 11, color: "#888" }}>
            {isAnimating ? `After ${roundLabels[Math.min(Math.round(showUpTo), numRounds - 1)]}` : `Combined score (best ${BEST_OF}) after each round`}
          </p>
        </div>
        {numRounds > 1 && (
          <button
            disabled={playing}
            onClick={play}
            style={{
              background: playing ? "#e0e0e0" : "linear-gradient(135deg," + G + "," + GD + ")",
              color: playing ? "#888" : "white",
              border: "none", borderRadius: 8, padding: fullScreen ? "9px 18px" : "7px 14px",
              fontSize: fullScreen ? 14 : 12, fontWeight: 600, cursor: playing ? "default" : "pointer",
              fontFamily: "'Georgia',serif",
              boxShadow: playing ? "none" : "0 2px 8px " + hexToRgba(G, 0.25),
            }}
          >
            {playing ? "Playing..." : "▶ Replay"}
          </button>
        )}
      </div>
      <div style={{ overflowX: "auto", padding: fullScreen ? "0 4px" : 0 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: fullScreen ? "100%" : W, display: "block", margin: "0 auto" }}>
          {/* Photo pattern defs */}
          <defs>
            {poolLB.map((p, pi) => {
              if (!photos[p.name]) return null;
              const r = fullScreen ? (claims[p.name] === uid ? 20 : 17) : (claims[p.name] === uid ? 14 : 12);
              const d = r * 2;
              return (
                <pattern key={"pat-" + pi} id={"pat-" + pi} patternUnits="objectBoundingBox" width="1" height="1">
                  <image href={photos[p.name]} width={d} height={d} preserveAspectRatio="xMidYMid slice" />
                </pattern>
              );
            })}
          </defs>
          {/* Grid lines + Y-axis labels */}
          {yTicks.map(v => {
            const y = getY(v);
            const isEven = v === 0;
            return (
              <g key={"tick-" + v}>
                <line x1={padL} x2={W - padR} y1={y} y2={y}
                  stroke={isEven ? hexToRgba(G, 0.25) : "#e8e8e8"}
                  strokeWidth={isEven ? 1.5 : 0.75}
                  strokeDasharray={isEven ? "none" : "2,3"} />
                <text x={padL - 6} y={y + 4} textAnchor="end"
                  fontSize={fullScreen ? 13 : 10} fontWeight={isEven ? 700 : 400}
                  fill={isEven ? G : v < 0 ? "#dc3545" : "#888"}
                  fontFamily="Georgia,serif">
                  {fmtPar(v)}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {roundLabels.map((label, ri) => (
            <text key={"x" + ri} x={getX(ri)} y={H - padB + 20} textAnchor="middle"
              fontSize={fullScreen ? 15 : 12} fontWeight={ri <= showUpTo ? 700 : 400}
              fill={ri <= showUpTo ? GD : "#ccc"} fontFamily="Georgia,serif">
              {label}
            </text>
          ))}

          {/* Vertical progress marker during animation */}
          {isAnimating && (
            <line x1={getX(showUpTo)} x2={getX(showUpTo)}
              y1={padT - 5} y2={padT + chartH + 5}
              stroke={GOLD} strokeWidth={2} opacity={0.4} strokeDasharray="4,3" />
          )}

          {/* Player trail lines — draw up to current progress */}
          {poolLB.map((p, pi) => {
            const color = CHART_COLORS_DYN[pi % CHART_COLORS_DYN.length];
            const scores = scoreData[p.name];
            const isMe = claims[p.name] === uid;

            // Collect all completed round points up to showUpTo
            const trailPoints = [];
            const maxFullRound = Math.floor(showUpTo);
            for (let ri = 0; ri <= maxFullRound && ri < scores.length; ri++) {
              if (scores[ri] != null) trailPoints.push({ x: getX(ri), y: getY(scores[ri]) });
            }
            // Add the interpolated current point
            if (isAnimating && showUpTo > maxFullRound) {
              const s = interpScore(scores, showUpTo);
              if (s != null) trailPoints.push({ x: getX(showUpTo), y: getY(s) });
            }

            if (!isAnimating) {
              // Show all mode — full trail
              scores.forEach((s, ri) => { if (s != null) trailPoints.push({ x: getX(ri), y: getY(s) }); });
            }

            if (trailPoints.length < 2) return null;
            // Deduplicate (show-all mode may double-add)
            const seen = new Set();
            const uniquePoints = trailPoints.filter(pt => { const k = pt.x + "," + pt.y; if (seen.has(k)) return false; seen.add(k); return true; });

            const pathD = uniquePoints.map((pt, i) => (i === 0 ? "M" : "L") + pt.x.toFixed(1) + "," + pt.y.toFixed(1)).join(" ");
            return (
              <path key={"trail-" + p.name} d={pathD} fill="none" stroke={color}
                strokeWidth={fullScreen ? (isMe ? 4 : 2.5) : (isMe ? 3 : 1.5)} strokeLinecap="round" strokeLinejoin="round"
                opacity={isAnimating ? (isMe ? 0.6 : 0.25) : (isMe ? 0.8 : 0.4)} />
            );
          })}

          {/* Player dots — smoothly interpolated position */}
          {poolLB.map((p, pi) => {
            const color = CHART_COLORS_DYN[pi % CHART_COLORS_DYN.length];
            const scores = scoreData[p.name];
            const isMe = claims[p.name] === uid;
            const r = fullScreen ? (isMe ? 20 : 17) : (isMe ? 14 : 12);

            let fx, fy, displayScore;
            if (isAnimating) {
              const s = interpScore(scores, showUpTo);
              if (s == null) return null;
              fx = getX(showUpTo);
              fy = getY(s);
              displayScore = Math.round(s);
            } else {
              const lastRi = scores.reduce((last, s, ri) => s != null ? ri : last, 0);
              const lastScore = scores[lastRi];
              if (lastScore == null) return null;
              fx = getX(lastRi);
              fy = getY(lastScore);
              displayScore = lastScore;
            }

            const hasPhoto = !!photos[p.name];
            const patId = "pat-" + pi;

            return (
              <g key={p.name} transform={`translate(${fx.toFixed(1)},${fy.toFixed(1)})`}>
                <circle cx={0} cy={2} r={r} fill="rgba(0,0,0,0.15)" />
                <circle cx={0} cy={0} r={r} fill={hasPhoto ? `url(#${patId})` : color} stroke="white" strokeWidth={2.5} />
                {!hasPhoto && (
                  <text x={0} y={-1} textAnchor="middle" dominantBaseline="central"
                    fontSize={fullScreen ? (r > 17 ? 13 : 11) : (r > 12 ? 10 : 9)} fontWeight={700} fill="white" fontFamily="Arial,sans-serif">
                    {p.name.substring(0, fullScreen ? 3 : 2).toUpperCase()}
                  </text>
                )}
                <text x={0} y={r + (fullScreen ? 12 : 9)} textAnchor="middle"
                  fontSize={fullScreen ? 10 : 8} fontWeight={600} fill={color} fontFamily="Arial,sans-serif">
                  {fmtPar(displayScore)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: fullScreen ? 12 : 8, marginTop: fullScreen ? 12 : 8, justifyContent: "center", padding: fullScreen ? "0 12px" : 0 }}>
        {poolLB.map((p, pi) => {
          const color = CHART_COLORS_DYN[pi % CHART_COLORS_DYN.length];
          const isMe = claims[p.name] === uid;
          const scores = scoreData[p.name];
          const lastScore = [...scores].reverse().find(v => v != null);
          return (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: fullScreen ? 13 : 11, fontWeight: isMe ? 700 : 400 }}>
              {photos[p.name] ? (
                <img src={photos[p.name]} alt="" style={{ width: fullScreen ? 18 : 12, height: fullScreen ? 18 : 12, borderRadius: "50%", objectFit: "cover", border: "1.5px solid " + color }} />
              ) : (
                <div style={{ width: fullScreen ? 14 : 10, height: fullScreen ? 14 : 10, borderRadius: "50%", background: color }} />
              )}
              <span style={{ color: GD }}>{p.name}</span>
              {lastScore != null && <span style={{ color: "#888" }}>({fmtPar(lastScore)})</span>}
            </div>
          );
        })}
      </div>
    </Wrap>
  );
}

function PhotoCapture({ playerName, currentPhoto, poolId, onSaved }) {
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const [saving, setSaving] = useState(false);

  const stopCamera = useCallback(() => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
    setShowCamera(false);
  }, [stream]);

  useEffect(() => () => { if (stream) stream.getTracks().forEach(t => t.stop()); }, [stream]);

  const processImage = useCallback((blob) => {
    const img = new Image();
    img.onload = async () => {
      const size = Math.min(img.width, img.height);
      const ox = (img.width - size) / 2, oy = (img.height - size) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = 80; canvas.height = 80;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, ox, oy, size, size, 0, 0, 80, 80);
      const base64 = canvas.toDataURL("image/jpeg", 0.7);
      setSaving(true);
      const ok = await savePhoto(poolId, playerName, base64);
      setSaving(false);
      if (ok && onSaved) onSaved(base64);
    };
    img.src = URL.createObjectURL(blob);
  }, [poolId, playerName, onSaved]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 320 } });
      setStream(s);
      setShowCamera(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 50);
    } catch (e) {
      console.error("Camera error:", e);
    }
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    canvas.toBlob((blob) => { if (blob) processImage(blob); }, "image/jpeg", 0.8);
    stopCamera();
  };

  if (showCamera) {
    return (
      <div style={{ textAlign: "center" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: 160, height: 160, objectFit: "cover", borderRadius: "50%", border: "3px solid " + G, background: "#000" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
          <button style={{ background: G, color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'Georgia',serif" }} onClick={takePhoto}>Take Photo</button>
          <button style={{ background: "#eee", color: "#666", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'Georgia',serif" }} onClick={stopCamera}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", border: "3px solid " + G, margin: "0 auto 8px", background: "#f0f0f0" }}>
        {currentPhoto ? (
          <img src={currentPhoto} alt={playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#ccc" }}>
            {playerName.substring(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      {saving ? (
        <div style={{ fontSize: 12, color: "#888" }}>Saving...</div>
      ) : (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button style={{ background: G, color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Georgia',serif" }} onClick={startCamera}>Camera</button>
          <button style={{ background: "white", color: GD, border: "1px solid #ddd", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Georgia',serif" }} onClick={() => fileRef.current?.click()}>Choose Photo</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        </div>
      )}
    </div>
  );
}

function SplashScreen({ eventName }) {
  const theme = getTheme(eventName);
  const isMasters = (eventName || "").toLowerCase().includes("masters");
  const isPlayers = (eventName || "").toLowerCase().includes("players");
  const isUSOpen = (eventName || "").toLowerCase().includes("u.s. open");
  const isOpen = (eventName || "").toLowerCase().includes("open championship");
  const isPGA = (eventName || "").toLowerCase().includes("pga champ");

  let tournamentLabel = "PGA TOUR";
  let tournamentSub = "Fantasy Golf Pool";
  if (isMasters) { tournamentLabel = "THE MASTERS"; tournamentSub = "Augusta National Golf Club"; }
  else if (isPlayers) { tournamentLabel = "THE PLAYERS"; tournamentSub = "TPC Sawgrass"; }
  else if (isPGA) { tournamentLabel = "PGA CHAMPIONSHIP"; tournamentSub = "Fantasy Golf Pool"; }
  else if (isUSOpen) { tournamentLabel = "U.S. OPEN"; tournamentSub = "Fantasy Golf Pool"; }
  else if (isOpen) { tournamentLabel = "THE OPEN"; tournamentSub = "Championship"; }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: `linear-gradient(160deg, ${theme.G} 0%, ${theme.GD} 50%, ${theme.BOARD_GREEN} 100%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Georgia','Palatino',serif",
      animation: "splashFadeIn 0.6s ease-out, splashFadeOut 0.6s ease-in 2.4s forwards",
    }}>
      {/* Splash icon — azaleas for Masters, flag pin for others */}
      <div style={{ animation: "splashPulse 2s ease-in-out infinite", marginBottom: 24 }}>
        {isMasters ? (
          <svg width="120" height="110" viewBox="0 0 120 110" fill="none">
            {/* Azalea cluster — left bloom */}
            <g transform="translate(18, 30)" opacity="0.9">
              {[0, 72, 144, 216, 288].map((angle, i) => (
                <ellipse key={i} cx="0" cy="-12" rx="7" ry="13"
                  fill={i % 2 === 0 ? "#E91E63" : "#F06292"}
                  transform={`rotate(${angle})`} />
              ))}
              <circle cx="0" cy="0" r="4" fill="#FFEB3B" opacity="0.9" />
            </g>
            {/* Center bloom (larger) */}
            <g transform="translate(60, 22)" opacity="0.95">
              {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                <ellipse key={i} cx="0" cy="-16" rx="9" ry="17"
                  fill={i % 2 === 0 ? "#C2185B" : "#E91E63"}
                  transform={`rotate(${angle})`} />
              ))}
              <circle cx="0" cy="0" r="5" fill="#FFF176" opacity="0.9" />
            </g>
            {/* Right bloom */}
            <g transform="translate(98, 35)" opacity="0.85">
              {[0, 72, 144, 216, 288].map((angle, i) => (
                <ellipse key={i} cx="0" cy="-11" rx="6.5" ry="12"
                  fill={i % 2 === 0 ? "#F06292" : "#E91E63"}
                  transform={`rotate(${angle})`} />
              ))}
              <circle cx="0" cy="0" r="3.5" fill="#FFEB3B" opacity="0.9" />
            </g>
            {/* Small bud — bottom left */}
            <g transform="translate(38, 50)" opacity="0.7">
              {[0, 72, 144, 216, 288].map((angle, i) => (
                <ellipse key={i} cx="0" cy="-8" rx="5" ry="9"
                  fill={i % 2 === 0 ? "#F48FB1" : "#F06292"}
                  transform={`rotate(${angle})`} />
              ))}
              <circle cx="0" cy="0" r="3" fill="#FFF9C4" opacity="0.9" />
            </g>
            {/* Small bud — bottom right */}
            <g transform="translate(80, 48)" opacity="0.75">
              {[0, 72, 144, 216, 288].map((angle, i) => (
                <ellipse key={i} cx="0" cy="-9" rx="5.5" ry="10"
                  fill={i % 2 === 0 ? "#E91E63" : "#F48FB1"}
                  transform={`rotate(${angle})`} />
              ))}
              <circle cx="0" cy="0" r="3" fill="#FFEB3B" opacity="0.9" />
            </g>
            {/* Leaves */}
            <ellipse cx="28" cy="65" rx="14" ry="6" fill="#2E7D32" opacity="0.6" transform="rotate(-20, 28, 65)" />
            <ellipse cx="90" cy="62" rx="13" ry="5.5" fill="#388E3C" opacity="0.5" transform="rotate(15, 90, 62)" />
            <ellipse cx="58" cy="70" rx="16" ry="5" fill="#1B5E20" opacity="0.4" transform="rotate(-5, 58, 70)" />
            {/* Flag pin through flowers */}
            <rect x="58" y="25" width="2.5" height="65" rx="1.25" fill={theme.GOLD} opacity="0.7" />
            <path d="M60.5 25 L60.5 42 L76 36 L60.5 30 Z" fill={theme.GOLD} opacity="0.6" />
            {/* Ball */}
            <circle cx="59.5" cy="95" r="4" fill="white" opacity="0.8" />
            <ellipse cx="59.5" cy="100" rx="16" ry="4" fill={hexToRgba(theme.GOLD, 0.1)} />
          </svg>
        ) : (
          <svg width="80" height="100" viewBox="0 0 80 100" fill="none">
            {/* Pole */}
            <rect x="38" y="15" width="3" height="75" rx="1.5" fill={theme.GOLD} opacity="0.9" />
            {/* Flag */}
            <path d="M41 15 L41 40 L65 32 L41 24 Z" fill={theme.GOLD} opacity="0.85" style={{ transformOrigin: "41px 27px", animation: "flagWave 3s ease-in-out infinite" }} />
            {/* Ball */}
            <circle cx="39.5" cy="92" r="5" fill="white" opacity="0.9" />
            {/* Ground arc */}
            <ellipse cx="39.5" cy="95" rx="20" ry="5" fill={hexToRgba(theme.GOLD, 0.15)} />
          </svg>
        )}
      </div>

      {/* Glowing divider — pink for Masters */}
      <div style={{
        width: 60, height: 2, borderRadius: 1,
        background: isMasters
          ? "linear-gradient(90deg, transparent, #E91E63, #F06292, #E91E63, transparent)"
          : `linear-gradient(90deg, transparent, ${theme.GOLD}, transparent)`,
        marginBottom: 20,
        animation: "splashPulse 2s ease-in-out infinite",
      }} />

      {/* Tournament name */}
      <h1 style={{
        margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: 6,
        color: theme.GOLD,
        textShadow: `0 2px 20px ${hexToRgba(theme.GOLD, 0.4)}`,
        animation: "splashSlideUp 0.8s ease-out 0.3s both",
      }}>{tournamentLabel}</h1>

      <p style={{
        margin: "8px 0 0", fontSize: 13, letterSpacing: 3,
        color: "rgba(255,255,255,0.6)",
        animation: "splashSlideUp 0.8s ease-out 0.5s both",
      }}>{tournamentSub}</p>

      {/* Loading indicator */}
      <div style={{
        marginTop: 40,
        display: "flex", gap: 6, alignItems: "center",
        animation: "splashSlideUp 0.8s ease-out 0.7s both",
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: isMasters ? "#F06292" : theme.GOLD,
            opacity: 0.5,
            animation: `splashPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function Shell({ children, joinCode, onHome }) {
  const isMastersShell = G === "#006747";
  return (
    <div style={{ fontFamily: "'Georgia','Palatino',serif", maxWidth: 680, margin: "0 auto", padding: "0 10px 50px", background: CREAM, minHeight: "100vh" }}>
      <div style={{ background: "linear-gradient(135deg," + G + "," + GD + ")", margin: "0 -10px", padding: "18px", marginBottom: 16, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div onClick={onHome} style={{ fontSize: 32, background: "rgba(255,255,255,0.12)", borderRadius: "50%", width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center", cursor: onHome ? "pointer" : "default" }}>{isMastersShell ? "🌺" : "⛳"}</div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: 2.5 }}>PGA TOUR POOL</h1>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.75)", letterSpacing: 1 }}>Snake Draft & Live Leaderboard</p>
          </div>
          {joinCode && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>CODE</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, letterSpacing: 2 }}>{joinCode}</div>
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
function Card({ children }) { return <div style={{ background: "white", borderRadius: 12, padding: "16px 18px", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>{children}</div>; }
function Toast({ msg }) { if (!msg) return null; return <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: GD, color: "white", padding: "10px 24px", borderRadius: 10, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", zIndex: 1000 }}>{msg}</div>; }
function Stat({ label, value, color }) { return <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "#888" }}>{label}</div><div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div></div>; }
function HoleScore({ h }) {
  if (h.strokes == null) return <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, padding: "4px 0", color: "#ccc" }}>—</div>;
  const n = parseInt(h.scoreType); // to-par for this hole
  const isEagle = !isNaN(n) && n <= -2;
  const isBirdie = n === -1;
  const isBogey = n === 1;
  const isDbl = !isNaN(n) && n >= 2;
  const clr = holeClr(h.scoreType);
  const shape = isEagle ? { borderRadius: "50%", border: "2px double " + clr, padding: "1px 0" }
    : isBirdie ? { borderRadius: "50%", border: "1.5px solid " + clr, padding: "1px 0" }
    : isDbl ? { borderRadius: 2, border: "2px double " + clr, padding: "1px 0" }
    : isBogey ? { borderRadius: 2, border: "1.5px solid " + clr, padding: "1px 0" }
    : {};
  return (
    <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, padding: "4px 0", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <span style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", minWidth: 22, minHeight: 22, color: clr, background: holeBg(h.scoreType), ...shape }}>{h.strokes}</span>
    </div>
  );
}

function HoleRow({ holes, label, startHole }) {
  const count = label === "Out" ? 9 : 9;
  const start = startHole || (label === "Out" ? 1 : 10);
  // Pad holes to always show 9 columns
  const padded = [];
  for (let i = 0; i < count; i++) {
    const holeNum = start + i;
    const existing = holes.find(h => h.hole === holeNum);
    padded.push(existing || { hole: holeNum, strokes: null, scoreType: null });
  }
  const played = padded.filter(h => h.strokes != null);
  const total = played.reduce((s, h) => s + (h.strokes || 0), 0);
  return (
    <div style={{ overflowX: "auto", marginBottom: 6 }}>
      <div style={{ display: "flex", minWidth: 360 }}>
        <div style={{ width: 36, fontSize: 10, fontWeight: 700, color: "#888", padding: "4px 0" }}>Hole</div>
        {padded.map(h => <div key={h.hole} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#888", padding: "4px 0" }}>{h.hole}</div>)}
        <div style={{ width: 36, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#888", padding: "4px 0" }}>{label}</div>
      </div>
      <div style={{ display: "flex", minWidth: 360 }}>
        <div style={{ width: 36 }}></div>
        {padded.map(h => <HoleScore key={h.hole} h={h} />)}
        <div style={{ width: 36, textAlign: "center", fontSize: 13, fontWeight: 700, color: GD, padding: "4px 0" }}>{played.length > 0 ? total : ""}</div>
      </div>
    </div>
  );
}

// Styles (S) are now computed dynamically inside App() via useMemo
