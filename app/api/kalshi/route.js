// app/api/kalshi/route.js
// Fetches golf betting odds and converts them to implied probabilities.
// Primary source: ESPN betting articles (scraped server-side).
// Fallback: Kalshi prediction markets when available.

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

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

  // Handle fractional odds like "17-1", "23-1"
  const fracMatch = s.match(/^(\d+)-(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1]);
    const den = parseInt(fracMatch[2]);
    // fractional odds: probability = den / (num + den)
    return Math.round((den / (num + den)) * 100);
  }

  // Handle "Even" or "EVEN"
  if (s.toLowerCase() === "even") return 50;

  const odds = parseInt(s);
  if (isNaN(odds)) return null;
  if (odds > 0) {
    // Underdog: prob = 100 / (odds + 100)
    return Math.round((100 / (odds + 100)) * 100);
  } else {
    // Favorite: prob = |odds| / (|odds| + 100)
    return Math.round((Math.abs(odds) / (Math.abs(odds) + 100)) * 100);
  }
}

// ---- ESPN Betting Article Scraper ----

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
    const articles = data.articles || [];

    const term = searchTerms[tournamentKey] || "betting odds";
    const keywords = term.split(" ");

    // Find the betting odds article for this tournament
    for (const art of articles) {
      const title = (art.headline || "").toLowerCase();
      const desc = (art.description || "").toLowerCase();
      const combined = title + " " + desc;
      if (keywords.every(w => combined.includes(w)) && combined.includes("odds")) {
        // Extract article URL
        const link = art.links?.web?.href || art.links?.api?.self?.href;
        if (link) return link;
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
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PGA-Pool/1.0)",
        "Accept": "text/html",
      },
      next: { revalidate: 1800 }, // cache 30 minutes
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // Parse odds tables from ESPN HTML
    // ESPN uses <table> elements with rows containing player odds
    const golfers = {};

    // Match table rows: each row has cells for player, to win, top 5, top 10, top 20, top 40, make cut, etc.
    // The HTML structure uses <tr> with <td> elements
    const tableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

    // First, find all tables in the page
    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];

    for (const table of tables) {
      // Get header row to determine column mapping
      const headerMatch = table.match(/<thead[\s\S]*?<\/thead>/i) ||
                          table.match(/<tr[^>]*>[\s\S]*?<\/tr>/i);

      if (!headerMatch) continue;

      const headerCells = [];
      let hm;
      const hCellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      while ((hm = hCellRegex.exec(headerMatch[0])) !== null) {
        headerCells.push(hm[1].replace(/<[^>]*>/g, "").trim().toLowerCase());
      }

      // Check if this table has betting odds columns
      const hasOddsColumns = headerCells.some(h =>
        h.includes("win") || h.includes("cut") || h.includes("top")
      );
      if (!hasOddsColumns) continue;

      // Map columns to categories
      const colMap = {};
      headerCells.forEach((h, i) => {
        if (h.includes("win") || h === "winner") colMap.winner = i;
        else if ((h.includes("make") && h.includes("cut")) || h.includes("cut")) colMap.cut = i;
        else if (h.includes("top 5") || h === "top5") colMap.top5 = i;
        else if (h.includes("top 10") || h === "top10") colMap.top10 = i;
        else if (h.includes("top 20") || h === "top20") colMap.top20 = i;
        // "to win" is also a common header
        if (h === "to win") colMap.winner = i;
      });

      // Parse data rows
      const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        // Skip header rows
        if (row.includes("<th")) continue;

        const cells = [];
        let cm;
        const rCellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        while ((cm = rCellRegex.exec(row)) !== null) {
          cells.push(cm[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim());
        }

        if (cells.length < 2) continue;

        // First cell is usually the player name
        const playerName = cells[0];
        if (!playerName || playerName.toLowerCase().includes("player") || playerName.length < 3) continue;

        const norm = normaliseName(playerName);
        if (!norm) continue;

        golfers[norm] = { name: playerName };

        // Extract odds from mapped columns
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

// ---- Kalshi Fallback ----

async function fetchKalshiData(tournamentKey) {
  const SERIES_MAP = {
    masters: { cut: "KXMASTERSCUT", top20: "KXMASTERST20", top10: "KXMASTERST10", top5: "KXMASTERST5", winner: "KXMASTERS" },
    pga: { cut: "KXPGACHAMPCUT", top20: "KXPGACHAMPT20", top10: "KXPGACHAMPT10", top5: "KXPGACHAMPT5", winner: "KXPGACHAMP" },
    usopen: { cut: "KXUSOPENCUT", top20: "KXUSOPENT20", top10: "KXUSOPENT10", top5: "KXUSOPENT5", winner: "KXUSOPEN" },
    open: { cut: "KXTHEOPENCUT", top20: "KXTHEOPENT20", top10: "KXTHEOPENT10", top5: "KXTHEOPENT5", winner: "KXTHEOPEN" },
  };

  const seriesMap = SERIES_MAP[tournamentKey];
  if (!seriesMap) return null;

  const golfers = {};
  const categories = ["cut", "top20", "top10", "top5", "winner"];
  const year = new Date().getFullYear().toString().slice(-2);

  const results = await Promise.all(
    categories.map(async (cat) => {
      const ticker = seriesMap[cat];
      for (const suffix of ["", `-${year}`]) {
        try {
          const url = `${KALSHI_BASE}/events?series_ticker=${ticker}${suffix}&status=open&with_nested_markets=true&limit=100`;
          const resp = await fetch(url, { headers: { "Accept": "application/json" }, next: { revalidate: 120 } });
          if (!resp.ok) continue;
          const data = await resp.json();
          let markets = [];
          for (const ev of (data.events || [])) {
            if (ev.markets) markets.push(...ev.markets);
          }
          if (markets.length) return { category: cat, markets };
        } catch {}
      }
      return { category: cat, markets: [] };
    })
  );

  for (const { category, markets } of results) {
    for (const mkt of markets) {
      const rawName = mkt.yes_sub_title || (() => {
        const m = (mkt.title || "").match(/^Will (.+?) (make|finish|win)/i);
        return m ? m[1] : null;
      })();
      if (!rawName) continue;
      const norm = normaliseName(rawName);
      if (!golfers[norm]) golfers[norm] = { name: rawName };
      const last = parseFloat(mkt.last_price || mkt.last_price_dollars);
      const prob = !isNaN(last) && last > 0 ? last : null;
      if (prob != null) golfers[norm][category] = Math.round(prob * 100);
    }
  }

  return Object.keys(golfers).length > 0 ? golfers : null;
}

// ---- Main Handler ----

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const eventName = searchParams.get("event") || "";

  const tournamentKey = detectTournament(eventName);
  if (!tournamentKey) {
    return Response.json({
      available: false,
      source: null,
      message: "Prediction data not available for this tournament",
      golfers: {},
    });
  }

  // Try ESPN betting article first (most reliable for current tournaments)
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

  // Fallback: Try Kalshi prediction markets
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

  return Response.json({
    available: false,
    source: null,
    tournament: tournamentKey,
    message: "No prediction data found — markets may not be open yet",
    golfers: {},
  });
}
