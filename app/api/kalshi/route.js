// app/api/kalshi/route.js
// Fetches prediction market data from Kalshi for golf tournaments.
// Returns per-golfer probabilities for: make the cut, top 20, top 10, top 5, winner.

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

// Map event names to Kalshi series tickers
const SERIES_MAP = {
  masters: {
    cut: "KXMASTERSCUT",
    top20: "KXMASTERST20",
    top10: "KXMASTERST10",
    top5: "KXMASTERST5",
    winner: "KXMASTERS",
  },
  pga: {
    cut: "KXPGACHAMPCUT",
    top20: "KXPGACHAMPT20",
    top10: "KXPGACHAMPT10",
    top5: "KXPGACHAMPT5",
    winner: "KXPGACHAMP",
  },
  usopen: {
    cut: "KXUSOPENCUT",
    top20: "KXUSOPENT20",
    top10: "KXUSOPENT10",
    top5: "KXUSOPENT5",
    winner: "KXUSOPEN",
  },
  open: {
    cut: "KXTHEOPENCUT",
    top20: "KXTHEOPENT20",
    top10: "KXTHEOPENT10",
    top5: "KXTHEOPENT5",
    winner: "KXTHEOPEN",
  },
};

function detectTournament(eventName) {
  const n = (eventName || "").toLowerCase();
  if (n.includes("masters")) return "masters";
  if (n.includes("pga champ")) return "pga";
  if (n.includes("u.s. open")) return "usopen";
  if (n.includes("open championship")) return "open";
  return null;
}

// Normalise golfer names for fuzzy matching (strip accents, lowercase, remove suffixes)
function normaliseName(name) {
  return (name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, "")
    .replace(/[^a-z ]/g, "")
    .trim();
}

async function fetchKalshiMarkets(seriesTicker) {
  // Search for active events under this series
  const eventsUrl = `${KALSHI_BASE}/events?series_ticker=${seriesTicker}&status=open&with_nested_markets=true&limit=100`;
  try {
    const resp = await fetch(eventsUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 120 }, // cache 2 minutes
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const events = data.events || [];
    // Collect all markets from all matching events
    let markets = [];
    for (const ev of events) {
      if (ev.markets) {
        markets.push(...ev.markets);
      }
    }
    // If no nested markets, try fetching markets separately for first event
    if (!markets.length && events.length) {
      const mktsUrl = `${KALSHI_BASE}/markets?event_ticker=${events[0].event_ticker}&limit=200`;
      const mktsResp = await fetch(mktsUrl, {
        headers: { "Accept": "application/json" },
        next: { revalidate: 120 },
      });
      if (mktsResp.ok) {
        const mktsData = await mktsResp.json();
        markets = mktsData.markets || [];
      }
    }
    return markets;
  } catch (err) {
    console.error(`Kalshi fetch error for ${seriesTicker}:`, err);
    return [];
  }
}

// Also try searching by keyword if series ticker approach yields nothing
async function searchKalshiEvents(tournamentKey) {
  const searchTerms = {
    masters: "masters golf",
    pga: "pga championship",
    usopen: "us open golf",
    open: "open championship golf",
  };
  const query = searchTerms[tournamentKey] || tournamentKey;
  try {
    const resp = await fetch(`${KALSHI_BASE}/events?status=open&limit=50`, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 300 },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.events || []).filter(e => {
      const t = (e.title || "").toLowerCase();
      return query.split(" ").every(w => t.includes(w));
    });
  } catch {
    return [];
  }
}

function extractGolferName(market) {
  // Try yes_sub_title first (cleanest), then parse from title
  if (market.yes_sub_title) return market.yes_sub_title;
  const title = market.title || "";
  // Pattern: "Will <Name> make the cut..." or "Will <Name> finish in the top..."
  const m = title.match(/^Will (.+?) (make|finish|win)/i);
  return m ? m[1] : null;
}

function getImpliedProbability(market) {
  // last_price_dollars is the implied probability on a $1 contract
  // If no last trade, use midpoint of yes_bid and yes_ask
  const last = parseFloat(market.last_price || market.last_price_dollars);
  if (!isNaN(last) && last > 0) return last;
  const bid = parseFloat(market.yes_bid || market.yes_bid_dollars || "0");
  const ask = parseFloat(market.yes_ask || market.yes_ask_dollars || "1");
  if (bid > 0 || ask < 1) return (bid + ask) / 2;
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const eventName = searchParams.get("event") || "";

  const tournamentKey = detectTournament(eventName);
  if (!tournamentKey) {
    return Response.json({
      available: false,
      message: "Prediction markets not available for this tournament",
      golfers: {},
    });
  }

  const seriesMap = SERIES_MAP[tournamentKey];
  const categories = ["cut", "top20", "top10", "top5", "winner"];

  // Fetch all market categories in parallel
  const results = await Promise.all(
    categories.map(async (cat) => {
      const ticker = seriesMap[cat];
      let markets = await fetchKalshiMarkets(ticker);

      // If no results with standard ticker, try with year suffix
      if (!markets.length) {
        const year = new Date().getFullYear().toString().slice(-2);
        markets = await fetchKalshiMarkets(`${ticker}-${year}`);
      }

      return { category: cat, markets };
    })
  );

  // Build per-golfer probability map
  const golfers = {}; // { normalised_name: { name, cut, top20, top10, top5, winner } }

  for (const { category, markets } of results) {
    for (const mkt of markets) {
      const rawName = extractGolferName(mkt);
      if (!rawName) continue;
      const norm = normaliseName(rawName);
      if (!golfers[norm]) golfers[norm] = { name: rawName };
      const prob = getImpliedProbability(mkt);
      if (prob != null) {
        golfers[norm][category] = Math.round(prob * 100);
      }
    }
  }

  // If we got no data from any category, try a broader search
  const totalMarkets = results.reduce((s, r) => s + r.markets.length, 0);
  if (totalMarkets === 0) {
    // Try event search as fallback
    const events = await searchKalshiEvents(tournamentKey);
    if (events.length) {
      // Fetch markets for discovered events
      for (const ev of events.slice(0, 5)) {
        const evTitle = (ev.title || "").toLowerCase();
        let cat = "winner";
        if (evTitle.includes("cut")) cat = "cut";
        else if (evTitle.includes("top 5")) cat = "top5";
        else if (evTitle.includes("top 10")) cat = "top10";
        else if (evTitle.includes("top 20")) cat = "top20";

        const mktsUrl = `${KALSHI_BASE}/markets?event_ticker=${ev.event_ticker}&limit=200`;
        try {
          const mktsResp = await fetch(mktsUrl, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 120 },
          });
          if (!mktsResp.ok) continue;
          const mktsData = await mktsResp.json();
          for (const mkt of (mktsData.markets || [])) {
            const rawName = extractGolferName(mkt);
            if (!rawName) continue;
            const norm = normaliseName(rawName);
            if (!golfers[norm]) golfers[norm] = { name: rawName };
            const prob = getImpliedProbability(mkt);
            if (prob != null) {
              golfers[norm][cat] = Math.round(prob * 100);
            }
          }
        } catch {}
      }
    }
  }

  return Response.json({
    available: Object.keys(golfers).length > 0,
    tournament: tournamentKey,
    golferCount: Object.keys(golfers).length,
    golfers,
  });
}
