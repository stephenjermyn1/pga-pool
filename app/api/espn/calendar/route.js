// app/api/espn/calendar/route.js
// Returns upcoming PGA Tour events from ESPN's calendar data.

export async function GET() {
  try {
    const resp = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    if (!resp.ok) {
      return Response.json({ error: "ESPN returned " + resp.status }, { status: 502 });
    }

    const data = await resp.json();

    // Extract calendar from leagues
    const league = data?.leagues?.[0];
    const calendar = league?.calendar || [];
    const now = new Date();

    // Parse calendar entries into upcoming events
    const upcoming = calendar
      .map(entry => {
        const start = new Date(entry.startDate);
        const end = new Date(entry.endDate);
        return {
          id: entry.id,
          name: entry.label || entry.name || "Unknown Event",
          startDate: entry.startDate,
          endDate: entry.endDate,
          start,
          end,
          isThisWeek: data.events?.some(e => e.id === entry.id),
          hasField: data.events?.some(e => e.id === entry.id && e.competitions?.[0]?.competitors?.length > 0),
        };
      })
      .filter(e => e.end >= now) // Only future or current events
      .sort((a, b) => a.start - b.start)
      .slice(0, 12) // Next 12 events
      .map(({ start, end, ...rest }) => rest); // Remove Date objects for JSON

    return Response.json({ upcoming });
  } catch (err) {
    console.error("ESPN calendar fetch error:", err);
    return Response.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}
