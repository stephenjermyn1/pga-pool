// app/api/espn/route.js
// This runs on Vercel's server, so it can call ESPN without CORS restrictions.
// The browser calls this route, and this route calls ESPN.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const eventIdx = parseInt(searchParams.get("event") || "0");

  try {
    const resp = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
      { next: { revalidate: 30 } } // Cache for 30 seconds
    );

    if (!resp.ok) {
      return Response.json({ error: "ESPN returned " + resp.status }, { status: 502 });
    }

    const data = await resp.json();

    if (!data?.events?.length) {
      return Response.json({ error: "No event data available" }, { status: 404 });
    }

    // Return list of events for selection
    const events = data.events.map((e, i) => ({
      idx: i,
      name: e.name,
      status: e.status?.type?.description || "",
    }));

    // Parse the selected event
    const ev = data.events[eventIdx] || data.events[0];
    const comp = ev.competitions?.[0];

    if (!comp?.competitors) {
      return Response.json({ error: "No competitor data", events }, { status: 404 });
    }

    const isComplete = comp.status?.type?.completed || false;
    const currentPeriod = comp.status?.period || 0; // which round the tournament is on (1-4)
    const tournamentState = comp.status?.type?.state || "pre"; // pre, in, post
    const detail = comp.status?.type?.detail || comp.status?.type?.description || "";
    const field = [];

    // First pass: find the max rounds completed by any player (tells us where the tournament is)
    let maxRoundsCompleted = 0;
    comp.competitors.forEach((c) => {
      (c.linescores || []).forEach((ls) => {
        const hasValue = ls.value != null && ls.value !== 0;
        const holes = ls.linescores || [];
        if (holes.length === 18 && hasValue) maxRoundsCompleted = Math.max(maxRoundsCompleted, 1);
      });
    });
    // Count properly per player below, but track global max
    const globalMaxCompleted = (() => {
      let mx = 0;
      comp.competitors.forEach(c => {
        let rc = 0;
        (c.linescores || []).forEach(ls => {
          const hasVal = ls.value != null && ls.value !== 0;
          const holes = ls.linescores || [];
          if (holes.length === 18 && hasVal) rc++;
        });
        if (rc > mx) mx = rc;
      });
      return mx;
    })();

    comp.competitors.forEach((c) => {
      const name = c.athlete?.displayName || "Unknown";
      const athleteId = c.id || null;
      const countryFlag = c.athlete?.flag?.href || null;
      const country = c.athlete?.flag?.alt || null;
      const scoreToPar = c.score || "E";
      const order = c.order || 999;

      const rounds = [];
      const holeByHole = [];

      (c.linescores || []).forEach((ls) => {
        const hasValue = ls.value != null && ls.value !== 0;
        const holes = (ls.linescores || []).map((h) => ({
          hole: h.period,
          strokes: h.value,
          scoreType: h.scoreType?.displayValue || "E",
        }));

        rounds.push({
          strokes: hasValue ? ls.value : null,
          displayValue: ls.displayValue || null,
          holesPlayed: holes.length,
          isComplete: holes.length === 18 && hasValue,
        });
        holeByHole.push(holes);
      });

      const r1Stats = c.linescores?.[0]?.statistics?.categories?.[0]?.stats || [];
      const teeTime = r1Stats[6]?.displayValue || "";
      const totalHolesPlayed = rounds.reduce((s, r) => s + (r.holesPlayed || 0), 0);
      const roundsCompleted = rounds.filter((r) => r.isComplete).length;

      let status = "active";
      // A player has missed the cut if tournament is in R3+ and they have no R3 tee time.
      // ESPN gives players who made the cut a tee time stat (index 6) in their R3 linescore;
      // cut players have no tee time. This is more reliable than counting completed rounds,
      // which breaks when R3 is underway but not everyone has teed off yet.
      if (currentPeriod >= 3 && roundsCompleted <= 2 && totalHolesPlayed > 0) {
        const r3Stats = c.linescores?.[2]?.statistics?.categories?.[0]?.stats || [];
        const r3Holes = rounds[2]?.holesPlayed || 0;
        const hasR3TeeTime = r3Stats.length >= 7 && r3Stats[6]?.displayValue;
        if (!hasR3TeeTime && r3Holes === 0) {
          status = "cut";
        }
      }

      field.push({
        name, athleteId, countryFlag, country, scoreToPar, order, rounds, holeByHole, status,
        holesPlayed: totalHolesPlayed, roundsCompleted, teeTime,
      });
    });

    field.sort((a, b) => a.order - b.order);

    // Determine winner only if tournament is truly complete (4 rounds played)
    const tournamentFullyComplete = globalMaxCompleted >= 4 && (isComplete || tournamentState === "post");
    const winner = tournamentFullyComplete ? field[0]?.name || null : null;

    return Response.json({
      eventName: ev.name,
      detail,
      isComplete: tournamentFullyComplete,
      field,
      winner,
      events,
    });
  } catch (err) {
    console.error("ESPN fetch error:", err);
    return Response.json({ error: "Failed to fetch ESPN data" }, { status: 500 });
  }
}
