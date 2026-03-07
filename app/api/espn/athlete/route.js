// app/api/espn/athlete/route.js
// Fetches individual athlete profile from ESPN (headshot, bio, season stats)

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "Missing athlete id" }, { status: 400 });
  }

  try {
    const resp = await fetch(
      `https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/athletes/${id}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour (profile data rarely changes)
    );

    if (!resp.ok) {
      return Response.json({ error: "ESPN returned " + resp.status }, { status: 502 });
    }

    const data = await resp.json();
    const a = data.athlete || {};

    // Extract season stats
    const seasonStats = {};
    const statCategories = a.statistics?.splits?.categories || [];
    statCategories.forEach(cat => {
      (cat.stats || []).forEach(st => {
        if (st.name && st.displayValue) {
          seasonStats[st.name] = {
            value: st.displayValue,
            rank: st.rank || null,
            label: st.displayName || st.name,
          };
        }
      });
    });

    // Also check top-level statistics for simpler format
    const topStats = data.statistics;
    if (topStats?.labels && topStats?.splits?.length) {
      const labels = topStats.labels;
      const values = topStats.splits[0]?.stats || [];
      labels.forEach((label, i) => {
        if (values[i] && !seasonStats[label]) {
          seasonStats[label] = { value: values[i], rank: null, label };
        }
      });
    }

    const profile = {
      id: a.id,
      name: a.displayName || a.fullName,
      headshot: a.headshot?.href || `https://a.espncdn.com/i/headshots/golf/players/full/${id}.png`,
      age: a.age || null,
      birthDate: a.dateOfBirth || null,
      birthPlace: a.birthPlace?.displayText || a.birthPlace?.city || null,
      country: a.citizenship || a.flag?.alt || null,
      countryFlag: a.flag?.href || null,
      hand: a.hand?.displayValue || a.hand || null,
      college: a.college?.name || null,
      status: a.status?.name || null,
      seasonStats,
    };

    return Response.json(profile);
  } catch (err) {
    console.error("ESPN athlete fetch error:", err);
    return Response.json({ error: "Failed to fetch athlete data" }, { status: 500 });
  }
}
