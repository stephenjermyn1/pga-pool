"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { savePool, loadPool, subscribePool, updatePool, initAuth, createPool, lookupJoinCode, claimPlayer } from "../lib/firebase";

const G = "#006747", GD = "#004d35", GOLD = "#d4af37", CREAM = "#fdf8e8";
const BOARD_GREEN = "#1a472a", BOARD_DARK = "#0f2d1a", BOARD_YELLOW = "#f4d03f", BOARD_RED = "#e74c3c";
const PICKS = 5, BEST_OF = 3, WINNER_BONUS = -10, MC_SCORE = 80, PAR = 72;

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
  const [adminUid, setAdminUid] = useState(null);

  // --- UI state ---
  const [names, setNames] = useState(["", "", "", ""]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showFullLB, setShowFullLB] = useState(false);
  const [golferDetail, setGolferDetail] = useState(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinErr, setJoinErr] = useState("");

  const unsubRef = useRef(null);

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
    applyPoolData(data);

    // Check if this user has a claim
    const claimedName = Object.entries(data.claims || {}).find(([, v]) => v === userId)?.[0] || null;
    setMyName(claimedName);

    // Save to localStorage
    localStorage.setItem("pga-pool-id", pid);
    if (claimedName) localStorage.setItem("pga-pool-name", claimedName);

    // Decide which screen
    if (!claimedName) {
      setScreen("join");
    } else if (data.draftDone) {
      setScreen("leaderboard");
    } else if (data.players?.length > 0) {
      setScreen("draft");
    } else {
      setScreen("join");
    }

    // Subscribe to real-time changes
    unsubRef.current = subscribePool(pid, (snap) => {
      if (snap) {
        applyPoolData(snap);
        setClaims(snap.claims || {});
        setAdminUid(snap.adminUid || null);
        setIsAdmin(snap.adminUid === userId);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPoolData(data) {
    setPlayers(data.players || []);
    setDraftOrder(data.draftOrder || []);
    setPickIdx(data.pickIdx || 0);
    setPicks(data.picks || {});
    setDraftDone(data.draftDone || false);
    setEventName(data.eventName || "");
    setSelectedEvent(data.selectedEvent || 0);
  }

  // ---- Save state changes ----
  const saveState = useCallback((overrides = {}) => {
    if (!poolId) return;
    const state = {
      players, draftOrder, pickIdx, picks, draftDone, eventName, selectedEvent,
      joinCode, adminUid, claims,
      ...overrides,
    };
    savePool(poolId, state);
  }, [poolId, players, draftOrder, pickIdx, picks, draftDone, eventName, selectedEvent, joinCode, adminUid, claims]);

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

  // Auto-fetch on leaderboard
  useEffect(() => {
    if (screen === "leaderboard") fetchESPN(selectedEvent);
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Pool Leaderboard ----
  const poolLB = (() => {
    if (!players.length || !Object.keys(picks).length || !espnField.length) return [];
    return players.map(player => {
      const myGolfers = (picks[player] || []).map(golfer => {
        let e = espnField.find(f => f.name === golfer);
        if (!e) e = espnField.find(f => f.name.toLowerCase().includes(golfer.toLowerCase()) || golfer.toLowerCase().includes(f.name.toLowerCase()));
        if (e) {
          let stp = e.scoreToPar;
          if (e.status === "cut" && e.roundsCompleted <= 2) {
            const extra = (MC_SCORE - PAR) * 2;
            const cur = stp === "E" ? 0 : parseInt(stp) || 0;
            stp = fmtPar(cur + extra);
          }
          const parNum = stp === "E" ? 0 : parseInt(stp) || 0;
          const isW = tournamentWinner && golfer.toLowerCase() === tournamentWinner.toLowerCase();
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
      <Shell joinCode={poolId ? joinCode : null}>
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

        {/* Round scores */}
        {g ? (
          <Card>
            <h3 style={S.sec}>Rounds</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {g.rounds.map((r, i) => (
                <div key={i} style={{ background: r.isComplete ? "#f0f7f0" : r.holesPlayed > 0 ? "#fff8e1" : "#f5f5f5", borderRadius: 8, padding: "8px 14px", textAlign: "center", flex: 1, minWidth: 60 }}>
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
                  <HoleRow holes={holes.slice(0, 9)} label="Out" />
                  {holes.length > 9 && <HoleRow holes={holes.slice(9, 18)} label="In" />}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 10, color: "#888", flexWrap: "wrap" }}>
                    <span style={{ color: "#B8860B" }}>■ Eagle+</span>
                    <span style={{ color: "#dc3545" }}>■ Birdie</span>
                    <span style={{ color: "#555" }}>■ Par</span>
                    <span style={{ background: "rgba(0,0,0,0.04)", padding: "0 4px", borderRadius: 2 }}>■ Bogey</span>
                    <span style={{ background: "rgba(0,0,0,0.08)", padding: "0 4px", borderRadius: 2 }}>■ Dbl+</span>
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

  if (screen === "loading") return <Shell><p style={{ textAlign: "center", color: "#999", padding: 40 }}>Loading...</p></Shell>;

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
        <p style={S.sub}>Enter everyone's name. Draft order will be randomised.</p>
        {names.map((n, i) => (
          <div key={i} style={S.row}>
            <span style={S.rowNum}>{i + 1}.</span>
            <input style={S.input} placeholder="Name..." value={n}
              onChange={e => { const u = [...names]; u[i] = e.target.value; setNames(u); }} />
            {i >= 4 && <button style={S.xBtn} onClick={() => setNames(names.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
        {names.length < 8 && <button style={S.dashed} onClick={() => setNames([...names, ""])}>+ Add Player</button>}
        <button style={{ ...S.primary, marginTop: 20, opacity: names.filter(n => n.trim()).length >= 2 ? 1 : 0.4 }}
          disabled={names.filter(n => n.trim()).length < 2}
          onClick={async () => {
            const valid = names.filter(n => n.trim()).map(n => n.trim());
            const shuffled = shuffle(valid);
            const order = snake(shuffled, PICKS);
            const p = {}; shuffled.forEach(n => p[n] = []);
            const claimsInit = {}; shuffled.forEach(n => claimsInit[n] = null);

            // Create pool in Firebase
            const result = await createPool(uid, {
              players: shuffled,
              draftOrder: order,
              pickIdx: 0,
              picks: p,
              draftDone: false,
              eventName: "",
              selectedEvent: 0,
              claims: claimsInit,
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
    <Shell joinCode={joinCode}>
      <Card>
        <h2 style={S.title}>Join Pool</h2>
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
                background: claimedByMe ? "#f0f7f0" : "white",
                fontFamily: "'Georgia',serif", fontSize: 15,
              }}
              onClick={async () => {
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
              <span style={{ fontWeight: 700, color: claimedByMe ? G : claimedByOther ? "#888" : GD }}>{name}</span>
              <span style={{ fontSize: 12, color: claimedByMe ? G : claimedByOther ? "#888" : "#999" }}>
                {claimedByMe ? "You" : claimedByOther ? "Claimed — tap to reclaim" : "Tap to claim"}
              </span>
            </button>
          );
        })}

        {myName && (
          <button style={{ ...S.primary, marginTop: 12 }}
            onClick={async () => {
              // Fetch field then go to draft
              const result = await fetchESPN(null);
              if (result || espnField.length > 0) {
                if (result?.eventName) {
                  await updatePool(poolId, { eventName: result.eventName, selectedEvent: selectedEvent });
                }
                setScreen(draftDone ? "leaderboard" : "draft");
              } else if (!showEventPicker) {
                // Even without ESPN data, allow continuing
                setScreen(draftDone ? "leaderboard" : "draft");
              }
            }}>
            {draftDone ? "Go to Leaderboard" : "Continue to Draft"}
          </button>
        )}
      </Card>
      {EventPicker}<Toast msg={toast} />
    </Shell>
  );

  // ---- DRAFT ----
  if (screen === "draft") {
    const allPicked = Object.values(picks).flat();
    const available = espnField.map(f => f.name).filter(g => !allPicked.includes(g));
    const filtered = search ? available.filter(g => g.toLowerCase().includes(search.toLowerCase())) : available;
    const round = Math.min(Math.floor(pickIdx / players.length) + 1, PICKS);
    const total = draftOrder.length;
    const displayPickIdx = Math.min(pickIdx, total);

    const doPick = (golfer) => {
      if (!canPick) { notify("It's not your turn!"); return; }
      if (allPicked.includes(golfer)) { notify("Already picked!"); return; }
      const u = { ...picks }; u[drafter] = [...(u[drafter] || []), golfer];
      const next = pickIdx + 1;
      const done = next >= total;
      setPicks(u); setPickIdx(next); setSearch("");
      if (done) setDraftDone(true);
      saveState({ picks: u, pickIdx: next, draftDone: done });
      notify(done ? "Draft complete!" : drafter + " picked " + golfer);
    };

    if (draftDone) return (
      <Shell joinCode={joinCode}>
        <Card>
          <h2 style={{ ...S.title, color: G, textAlign: "center" }}>Draft Complete!</h2>
          <p style={{ ...S.sub, textAlign: "center", fontWeight: 600 }}>{eventName}</p>
          {players.map(p => (
            <div key={p} style={S.teamCard}>
              <div style={S.teamName}>{p} {claims[p] === uid && <span style={{ fontSize: 11, color: GOLD }}>(You)</span>}</div>
              {(picks[p] || []).map((g, i) => (<div key={g} style={{ fontSize: 13, padding: "3px 0", color: "#333" }}><span style={{ color: G, fontWeight: 700, fontSize: 12, marginRight: 6 }}>#{i + 1}</span>{g}</div>))}
            </div>
          ))}
          <button style={S.primary} onClick={() => setScreen("leaderboard")}>Go to Leaderboard</button>
        </Card>
        {EventPicker}<Toast msg={toast} />
      </Shell>
    );

    return (
      <Shell joinCode={joinCode}>
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
            </div>
          )}
          {canPick && isAdmin && claims[drafter] !== uid && (
            <div style={{ marginTop: 8, padding: "6px 12px", background: "rgba(212,175,55,0.25)", borderRadius: 8, fontSize: 12, color: GOLD }}>
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
            <input style={S.searchInput} placeholder="Search golfers..." value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, maxHeight: 350, overflowY: "auto" }}>
              {filtered.map(golfer => (<button key={golfer} style={S.golferBtn} onClick={() => doPick(golfer)}>{golfer}</button>))}
            </div>
            {espnField.length === 0 && <button style={{ ...S.primary, marginTop: 10, fontSize: 13, padding: "10px 16px" }} onClick={() => fetchESPN(selectedEvent)} disabled={isLoading}>{isLoading ? "Fetching..." : "Fetch Field from ESPN"}</button>}
          </Card>
        )}

        {isAdmin && pickIdx > 0 && <button style={S.undo} onClick={() => {
          const prev = pickIdx - 1, pd = draftOrder[prev];
          const u = { ...picks }; u[pd] = (u[pd] || []).slice(0, -1);
          setPicks(u); setPickIdx(prev); setDraftDone(false);
          saveState({ picks: u, pickIdx: prev, draftDone: false });
          notify("Undone");
        }}>↩ Undo Last Pick</button>}
        {EventPicker}<Toast msg={toast} />
      </Shell>
    );
  }

  // ---- LEADERBOARD ----
  if (screen === "leaderboard") return (
    <Shell joinCode={joinCode}>
      <div style={S.eventBanner}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, fontWeight: 700 }}>
          {tournamentDone ? "FINAL" : espnField.some(f => f.holesPlayed > 0) ? "LIVE" : "LEADERBOARD"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>{eventName}</div>
        {eventDetail && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{eventDetail}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button style={{ ...S.ctrl, opacity: isLoading ? 0.5 : 1 }} onClick={() => fetchESPN(selectedEvent)} disabled={isLoading}>
          {isLoading ? "..." : "Refresh"}
        </button>
        <button style={{ ...S.ctrl, background: showFullLB ? G : "white", color: showFullLB ? "white" : GD }} onClick={() => setShowFullLB(!showFullLB)}>
          {showFullLB ? "Pool View" : "Tournament"}
        </button>
        <button style={S.ctrl} onClick={() => setShowRules(!showRules)}>Rules</button>
        <button style={S.ctrl} onClick={() => setScreen("draft")}>Draft</button>
        <button style={S.ctrl} onClick={copyInviteLink}>Share</button>
        {isAdmin && (
          <button style={{ ...S.ctrl, marginLeft: "auto", color: "#dc3545", borderColor: "#dc3545" }}
            onClick={() => { if (confirm("Reset everything? This cannot be undone.")) {
              savePool(poolId, null);
              localStorage.removeItem("pga-pool-id");
              localStorage.removeItem("pga-pool-name");
              setPoolId(null); setPlayers([]); setDraftOrder([]); setPickIdx(0); setPicks({}); setDraftDone(false); setEspnField([]); setEventName(""); setNames(["", "", "", ""]); setMyName(null); setJoinCode(""); setScreen("home");
            } }}>Reset</button>
        )}
      </div>
      {lastUpdated && <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>Updated: {lastUpdated}</div>}
      {fetchErr && <div style={{ fontSize: 12, color: "#dc3545", marginBottom: 8 }}>{fetchErr}</div>}

      {showRules && (
        <Card>
          <h3 style={S.sec}>Scoring Rules</h3>
          <p style={S.rule}>Your <strong>best 3 of 5</strong> golfers count (lowest combined to-par score).</p>
          <p style={S.rule}>If your golfer <strong>wins the tournament</strong>: −10 from your total.</p>
          <p style={S.rule}>Missed cut golfers get <strong>+8 per missed round</strong> (80 on par 72).</p>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #eee", display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
            <span><strong style={{ color: G }}>68</strong> = finished round</span>
            <span><strong style={{ color: "#dc3545" }}>−3</strong> = under par</span>
            <span><strong style={{ color: "#333" }}>+2</strong> = over par</span>
          </div>
        </Card>
      )}
      {tournamentWinner && <div style={S.winnerBanner}>Champion: {tournamentWinner}</div>}

      {showFullLB ? (
        <Card>
          <h3 style={S.sec}>Tournament Leaderboard</h3>
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            {espnField.map((g, i) => {
              const isPicked = Object.values(picks).flat().includes(g.name);
              return (
                <div key={g.name} style={{ display: "flex", alignItems: "center", padding: "6px 4px", borderBottom: "1px solid #f0f0f0", background: isPicked ? "rgba(0,103,71,0.06)" : "transparent", cursor: "pointer" }} onClick={() => setGolferDetail(g.name)}>
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
        <div style={{ background: BOARD_GREEN, borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", border: "3px solid #2d5a3d", marginBottom: 12 }}>
          <div style={{ background: BOARD_DARK, padding: "10px 16px", textAlign: "center", borderBottom: "2px solid #2d5a3d" }}>
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
                    const clr = rs == null ? "rgba(255,255,255,0.15)" : inProg ? (rs < 0 ? BOARD_RED : rs > 0 ? "rgba(255,255,255,0.6)" : BOARD_YELLOW) : "#8fbc8f";
                    return <div key={ri} style={{ flex: 0.45, textAlign: "center", fontSize: 12, fontWeight: 600, color: clr }}>{rs != null ? fmtPar(rs) : "—"}</div>;
                  })}
                  <div style={{ flex: 0.6, textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor, fontFamily: "'Georgia',serif" }}>
                      {e.hasScores ? fmtPar(e.combinedPar) : "—"}
                    </div>
                    {e.hasWinner && <div style={{ fontSize: 9, color: BOARD_YELLOW, fontWeight: 700 }}>−10 BONUS</div>}
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
                            const rdColor = rd.isComplete ? "#8fbc8f" : rd.holesPlayed > 0 ? (parseInt(rd.displayValue) < 0 ? BOARD_RED : parseInt(rd.displayValue) > 0 ? "rgba(255,255,255,0.6)" : BOARD_YELLOW) : "rgba(255,255,255,0.15)";
                            return <div key={r} style={{ flex: 0.45, textAlign: "center", fontSize: 12, fontWeight: 600, color: rdColor }}>
                              {rd.isComplete ? rd.strokes : rd.holesPlayed > 0 ? (rd.displayValue || "—") : "—"}
                            </div>;
                          })}
                          <div style={{ flex: 0.6, textAlign: "right", fontSize: 13, fontWeight: 700, color: gScoreClr }}>{g.found ? g.scoreToPar : "—"}</div>
                        </div>
                      );
                    })}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 6, marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
                      Best 3 = <strong style={{ color: e.combinedPar - (e.hasWinner ? WINNER_BONUS : 0) < 0 ? BOARD_RED : BOARD_YELLOW }}>{fmtPar(e.combinedPar - (e.hasWinner ? WINNER_BONUS : 0))}</strong>
                      {e.hasWinner && <span style={{ color: BOARD_YELLOW }}> + bonus (−10) = <strong>{fmtPar(e.combinedPar)}</strong></span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {poolLB.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Complete the draft, then refresh scores.</div>}
        </div>
      </>)}
      {EventPicker}<Toast msg={toast} />
    </Shell>
  );

  return <Shell><p>Something went wrong.</p></Shell>;
}

// ============================================================
function Shell({ children, joinCode }) {
  return (
    <div style={{ fontFamily: "'Georgia','Palatino',serif", maxWidth: 680, margin: "0 auto", padding: "0 10px 50px", background: CREAM, minHeight: "100vh" }}>
      <div style={{ background: "linear-gradient(135deg," + G + "," + GD + ")", margin: "0 -10px", padding: "18px", marginBottom: 16, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32, background: "rgba(255,255,255,0.12)", borderRadius: "50%", width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>⛳</div>
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
function HoleRow({ holes, label }) {
  const total = holes.reduce((s, h) => s + (h.strokes || 0), 0);
  return (
    <div style={{ overflowX: "auto", marginBottom: 6 }}>
      <div style={{ display: "flex", minWidth: 360 }}>
        <div style={{ width: 36, fontSize: 10, fontWeight: 700, color: "#888", padding: "4px 0" }}>Hole</div>
        {holes.map(h => <div key={h.hole} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#888", padding: "4px 0" }}>{h.hole}</div>)}
        <div style={{ width: 36, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#888", padding: "4px 0" }}>{label}</div>
      </div>
      <div style={{ display: "flex", minWidth: 360 }}>
        <div style={{ width: 36 }}></div>
        {holes.map(h => <div key={h.hole} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, padding: "4px 0", color: holeClr(h.scoreType), background: holeBg(h.scoreType), borderRadius: 4 }}>{h.strokes != null ? h.strokes : ""}</div>)}
        <div style={{ width: 36, textAlign: "center", fontSize: 13, fontWeight: 700, color: GD, padding: "4px 0" }}>{total || ""}</div>
      </div>
    </div>
  );
}

const S = {
  title: { margin: "0 0 4px", fontSize: 19, color: GD }, sub: { margin: "0 0 14px", fontSize: 13, color: "#888" },
  sec: { margin: "0 0 10px", fontSize: 15, color: GD }, row: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
  rowNum: { fontSize: 13, color: "#888", minWidth: 24 },
  input: { flex: 1, padding: "9px 11px", borderRadius: 7, border: "1px solid #ddd", fontSize: 14, outline: "none", fontFamily: "'Georgia',serif", width: "100%", boxSizing: "border-box" },
  searchInput: { width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box", fontFamily: "'Georgia',serif" },
  xBtn: { background: "none", border: "none", fontSize: 16, color: "#999", cursor: "pointer", padding: "4px 8px" },
  dashed: { background: "none", border: "2px dashed " + G, borderRadius: 7, padding: "9px", color: G, fontSize: 13, cursor: "pointer", width: "100%", marginBottom: 4, fontFamily: "'Georgia',serif" },
  primary: { background: "linear-gradient(135deg," + G + "," + GD + ")", color: "white", border: "none", borderRadius: 9, padding: "13px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%", fontFamily: "'Georgia',serif", boxShadow: "0 4px 12px rgba(0,103,71,0.25)" },
  smallBtn: { background: G, color: "white", border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'Georgia',serif", whiteSpace: "nowrap" },
  badge: { background: G, color: "white", padding: "3px 10px", borderRadius: 16, fontSize: 12, fontWeight: 600 },
  bar: { background: "#e0e0e0", borderRadius: 8, height: 7, overflow: "hidden" },
  barFill: { background: "linear-gradient(90deg," + G + "," + GOLD + ")", height: "100%", borderRadius: 8, transition: "width 0.3s" },
  pickerCard: { background: "linear-gradient(135deg," + G + "," + GD + ")", borderRadius: 12, padding: 22, textAlign: "center", marginBottom: 12, boxShadow: "0 4px 16px rgba(0,103,71,0.3)" },
  golferBtn: { background: "white", border: "1px solid " + G, borderRadius: 7, padding: "9px 8px", fontSize: 12, cursor: "pointer", textAlign: "left", fontFamily: "'Georgia',serif", color: GD },
  undo: { background: "white", border: "2px solid #ff9800", color: "#ff9800", borderRadius: 9, padding: "11px 16px", fontSize: 13, cursor: "pointer", width: "100%", fontFamily: "'Georgia',serif", fontWeight: 600, marginTop: 2 },
  teamCard: { background: "#f0f7f0", borderRadius: 9, padding: 12, marginBottom: 10 },
  teamName: { fontSize: 15, fontWeight: 700, color: GD, marginBottom: 6 },
  ctrl: { background: "white", border: "1px solid #ddd", borderRadius: 7, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: "'Georgia',serif" },
  eventBanner: { background: "linear-gradient(135deg," + G + "," + GD + ")", borderRadius: 10, padding: "12px 16px", marginBottom: 12, textAlign: "center" },
  winnerBanner: { background: "linear-gradient(135deg," + GOLD + ",#f5d478)", borderRadius: 10, padding: "12px 16px", textAlign: "center", fontSize: 17, fontWeight: 700, color: GD, marginBottom: 12, boxShadow: "0 3px 10px rgba(212,175,55,0.3)" },
  mc: { marginLeft: 5, fontSize: 10, background: "#dc3545", color: "white", padding: "1px 5px", borderRadius: 3, fontWeight: 700 },
  rule: { margin: "4px 0", fontSize: 13, color: "#555" },
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 },
  modal: { background: "white", borderRadius: 14, padding: "24px 20px", maxWidth: 400, width: "100%", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" },
  eventBtn: { display: "block", width: "100%", textAlign: "left", padding: "14px 16px", marginBottom: 8, background: CREAM, border: "2px solid " + G, borderRadius: 10, cursor: "pointer", fontFamily: "'Georgia',serif" },
};
