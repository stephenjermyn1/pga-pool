// app/api/kalshi/route.js
// Fetches golf betting odds and converts them to implied probabilities.
// Primary: Kalshi prediction markets (live, real-time, no auth needed).
// Fallback: ESPN betting article (scraped server-side).

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

// Kalshi uses generic KXPGA* series tickers with tournament-specific event suffixes.
// Series tickers for each market category:
const KALSHI_SERIES = {
  cut:    "KXPGAMAKECUT",
  top5:   "KXPGATOP5",
  top10:  "KXPGATOP10",
  top20:  "KXPGATOP20",
  winner: "KXPGATOUR",
};

// Map tournament keys to Kalshi competition names (used to match from product_metadata)
const TOURNAMENT_NAMES = {
  masters: "the masters",
  pga: "pga championship",
  usopen: "u.s. open",
  open: "the open championship",
};

function detectTournament(eventName) {
  const n = (eventName || "").toLowerCase();
  if (n.includes("masters")) return "masters";
  if (n.includes("pga champ")) return "pga";
  if (n.includes("u.s. open")) return "usopen";
  if (n.includes("open championship")) return "open";
  return null;
}

function normaliseName(name) {
  return (name || "")
    .replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ð/gi, "d")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, "")
    .replace(/[^a-z ]/g, "")
    .trim();
}

// Convert American odds to implied probability (0-100)
function americanToProb(oddsStr) {
  if (!oddsStr || oddsStr === "--" || oddsStr === "—") return null;
  const s = oddsStr.toString().trim().replace(/,/g, "");
  const fracMatch = s.match(/^(\d+)-(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1]), den = parseInt(fracMatch[2]);
    return Math.round((den / (num + den)) * 100);
  }
  if (s.toLowerCase() === "even") return 50;
  const odds = parseInt(s);
  if (isNaN(odds)) return null;
  if (odds > 0) return Math.round((100 / (odds + 100)) * 100);
  return Math.round((Math.abs(odds) / (Math.abs(odds) + 100)) * 100);
}

// ---- Kalshi (Primary Source) ----

async function fetchKalshiData(tournamentKey) {
  const compName = TOURNAMENT_NAMES[tournamentKey];
  if (!compName) return null;

  const golfers = {};
  const categories = Object.keys(KALSHI_SERIES); // cut, top5, top10, top20, winner

  const results = await Promise.all(
    categories.map(async (cat) => {
      const seriesTicker = KALSHI_SERIES[cat];
      try {
        // Fetch all events for this series, find the one matching our tournament
        const url = `${KALSHI_BASE}/events?series_ticker=${seriesTicker}&limit=20`;
        const resp = await fetch(url, {
          headers: { "Accept": "application/json" },
          next: { revalidate: 120 },
        });
        if (!resp.ok) return { category: cat, markets: [] };
        const data = await resp.json();

        // Find the event for this tournament by checking product_metadata.competition
        const matchingEvent = (data.events || []).find(ev => {
          const evComp = (ev.product_metadata?.competition || "").toLowerCase();
          return evComp.includes(compName) || compName.includes(evComp);
        });

        if (!matchingEvent) return { category: cat, markets: [] };

        // Fetch markets for this event
        const mktsUrl = `${KALSHI_BASE}/markets?event_ticker=${matchingEvent.event_ticker}&limit=200`;
        const mktsResp = await fetch(mktsUrl, {
          headers: { "Accept": "application/json" },
          next: { revalidate: 120 },
        });
        if (!mktsResp.ok) return { category: cat, markets: [] };
        const mktsData = await mktsResp.json();

        // If paginated, fetch remaining pages
        let markets = mktsData.markets || [];
        let cursor = mktsData.cursor;
        while (cursor) {
          const nextUrl = `${KALSHI_BASE}/markets?event_ticker=${matchingEvent.event_ticker}&limit=200&cursor=${cursor}`;
          const nextResp = await fetch(nextUrl, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 120 },
          });
          if (!nextResp.ok) break;
          const nextData = await nextResp.json();
          markets = markets.concat(nextData.markets || []);
          cursor = nextData.cursor || null;
        }

        return { category: cat, markets };
      } catch (err) {
        console.error(`Kalshi fetch error for ${cat}:`, err);
        return { category: cat, markets: [] };
      }
    })
  );

  for (const { category, markets } of results) {
    for (const mkt of markets) {
      // Only process active markets
      if (mkt.status && mkt.status !== "active" && mkt.status !== "open") continue;

      const rawName = mkt.yes_sub_title || (() => {
        const title = mkt.title || "";
        // "The Masters: Will Scottie Scheffler make the cut?"
        const m = title.match(/Will (.+?) (make|finish|win|be)/i);
        return m ? m[1] : null;
      })();
      if (!rawName) continue;

      const norm = normaliseName(rawName);
      if (!golfers[norm]) golfers[norm] = { name: rawName };

      // last_price_dollars IS the implied probability on a $0-$1 contract
      const last = parseFloat(mkt.last_price || mkt.last_price_dollars);
      if (!isNaN(last) && last > 0) {
        golfers[norm][category] = Math.round(last * 100);
      } else {
        // Fall back to midpoint of yes bid/ask
        const bid = parseFloat(mkt.yes_bid || mkt.yes_bid_dollars || "0");
        const ask = parseFloat(mkt.yes_ask || mkt.yes_ask_dollars || "1");
        if (bid > 0 || ask < 1) {
          golfers[norm][category] = Math.round(((bid + ask) / 2) * 100);
        }
      }
    }
  }

  return Object.keys(golfers).length > 0 ? golfers : null;
}

// ---- ESPN Betting Article (Fallback) ----

async function findEspnBettingArticle(tournamentKey) {
  const searchTerms = {
    masters: "masters betting odds",
    pga: "pga championship betting odds",
    usopen: "us open betting odds",
    open: "open championship betting odds",
  };
  try {
    const resp = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/golf/pga/news?limit=30",
      { next: { revalidate: 3600 } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const keywords = (searchTerms[tournamentKey] || "betting odds").split(" ");
    for (const art of (data.articles || [])) {
      const combined = ((art.headline || "") + " " + (art.description || "")).toLowerCase();
      if (keywords.every(w => combined.includes(w)) && combined.includes("odds")) {
        return art.links?.web?.href || null;
      }
    }
  } catch (err) {
    console.error("ESPN article search error:", err);
  }
  return null;
}

async function scrapeEspnOdds(articleUrl) {
  try {
    const resp = await fetch(articleUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PGA-Pool/1.0)", "Accept": "text/html" },
      next: { revalidate: 1800 },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const golfers = {};
    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];

    for (const table of tables) {
      const headerMatch = table.match(/<thead[\s\S]*?<\/thead>/i) || table.match(/<tr[^>]*>[\s\S]*?<\/tr>/i);
      if (!headerMatch) continue;
      const headerCells = [];
      const hCellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let hm;
      while ((hm = hCellRegex.exec(headerMatch[0])) !== null) {
        headerCells.push(hm[1].replace(/<[^>]*>/g, "").trim().toLowerCase());
      }
      if (!headerCells.some(h => h.includes("win") || h.includes("cut") || h.includes("top"))) continue;

      const colMap = {};
      headerCells.forEach((h, i) => {
        if (h.includes("win") || h === "winner" || h === "to win") colMap.winner = i;
        else if (h.includes("cut")) colMap.cut = i;
        else if (h.includes("top 5")) colMap.top5 = i;
        else if (h.includes("top 10")) colMap.top10 = i;
        else if (h.includes("top 20")) colMap.top20 = i;
      });

      const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        if (row.includes("<th")) continue;
        const cells = [];
        const rCellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cm;
        while ((cm = rCellRegex.exec(row)) !== null) {
          cells.push(cm[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim());
        }
        if (cells.length < 2) continue;
        const playerName = cells[0];
        if (!playerName || playerName.toLowerCase().includes("player") || playerName.length < 3) continue;
        const norm = normaliseName(playerName);
        if (!norm) continue;
        golfers[norm] = { name: playerName };
        for (const [cat, colIdx] of Object.entries(colMap)) {
          if (colIdx < cells.length) {
            const prob = americanToProb(cells[colIdx]);
            if (prob != null) golfers[norm][cat] = prob;
          }
        }
      }
    }
    return Object.keys(golfers).length > 0 ? golfers : null;
  } catch (err) {
    console.error("ESPN scrape error:", err);
    return null;
  }
}

// ---- Main Handler ----

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const eventName = searchParams.get("event") || "";

  const tournamentKey = detectTournament(eventName);
  if (!tournamentKey) {
    return Response.json({
      available: false, source: null,
      message: "Prediction data not available for this tournament",
      golfers: {},
    });
  }

  // Try Kalshi first (live prediction market data, updates in real-time)
  const kalshiGolfers = await fetchKalshiData(tournamentKey);
  if (kalshiGolfers) {
    return Response.json({
      available: true,
      source: "kalshi",
      tournament: tournamentKey,
      golferCount: Object.keys(kalshiGolfers).length,
      golfers: kalshiGolfers,
    });
  }

  // Fallback: ESPN betting article (sportsbook odds, updated less frequently)
  const articleUrl = await findEspnBettingArticle(tournamentKey);
  if (articleUrl) {
    const espnGolfers = await scrapeEspnOdds(articleUrl);
    if (espnGolfers) {
      return Response.json({
        available: true,
        source: "espn",
        tournament: tournamentKey,
        golferCount: Object.keys(espnGolfers).length,
        golfers: espnGolfers,
      });
    }
  }

  return Response.json({
    available: false, source: null, tournament: tournamentKey,
    message: "No prediction data found",
    golfers: {},
  });
}
