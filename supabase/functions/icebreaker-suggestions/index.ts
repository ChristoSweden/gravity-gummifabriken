// Supabase Edge Function: icebreaker-suggestions
// Fetches real-time news headlines for a person's interests/profession
// and returns suggested icebreaker opening lines for connection requests.
//
// POST body: { interests: string[], profession: string, shared_interests: string[] }
// Returns:   { suggestions: string[] }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  interests: string[];
  profession: string;
  shared_interests: string[];
}

/** Fetch Google News RSS for a query and extract headlines */
async function fetchHeadlines(query: string, limit = 3): Promise<string[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Gravity-App/1.0' },
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // Simple XML title extraction — no parser needed
    const titles: string[] = [];
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && titles.length < limit) {
      const titleMatch = match[0].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                         match[0].match(/<title>(.*?)<\/title>/);
      if (titleMatch && titleMatch[1]) {
        // Strip source suffix like " - TechCrunch"
        const clean = titleMatch[1].replace(/ - [^-]+$/, '').trim();
        if (clean.length > 10 && clean.length < 200) {
          titles.push(clean);
        }
      }
    }
    return titles;
  } catch {
    return [];
  }
}

/** Build icebreaker suggestions from headlines */
function buildSuggestions(
  headlines: { topic: string; title: string }[],
  shared: string[],
  profession: string
): string[] {
  const suggestions: string[] = [];

  // News-based icebreakers
  for (const h of headlines) {
    if (suggestions.length >= 3) break;
    suggestions.push(
      `I just read that "${h.title}" — as someone in ${h.topic}, what's your take?`
    );
  }

  // If we have fewer than 3, add interest-based ones
  if (suggestions.length < 3 && shared.length > 0) {
    const interest = shared[0];
    suggestions.push(
      `We both share an interest in ${interest} — I'd love to hear what got you into it!`
    );
  }

  if (suggestions.length < 3 && profession) {
    suggestions.push(
      `Your work in ${profession} sounds fascinating — what are you currently focused on?`
    );
  }

  return suggestions.slice(0, 3);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body: RequestBody = await req.json();
    const { interests = [], profession = '', shared_interests = [] } = body;

    // Build search queries — prioritize shared interests, then their profession
    const queries: string[] = [];
    for (const si of shared_interests.slice(0, 2)) {
      queries.push(si);
    }
    if (profession && queries.length < 2) {
      queries.push(profession);
    }
    if (queries.length === 0 && interests.length > 0) {
      queries.push(interests[0]);
    }

    // Fetch headlines in parallel
    const results = await Promise.all(
      queries.map(async (q) => {
        const titles = await fetchHeadlines(q, 2);
        return titles.map((title) => ({ topic: q, title }));
      })
    );
    const allHeadlines = results.flat();

    const suggestions = buildSuggestions(allHeadlines, shared_interests, profession);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ suggestions: [], error: (err as Error).message }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
