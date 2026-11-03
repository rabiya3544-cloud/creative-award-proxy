import * as cheerio from 'cheerio';

const TARGET_URL =
  'https://creativeawards.et/categories/01a0ecb7-050a-7301-b24f-1295e081dd6b';

const clean = (s = '') => s.replace(/\s+/g, ' ').trim();

/**
 * Parses "435K" -> 435000, "1.2M" -> 1200000, "1,091 votes" -> 1091
 */
function parseCount(text) {
  if (!text) return null;
  const s = clean(text).toUpperCase().replace(/,/g, '');
  const match = s.match(/([\d.]+)\s*([KM]?)/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (Number.isNaN(n)) return null;
  const mult = match[2] === 'K' ? 1e3 : match[2] === 'M' ? 1e6 : 1;
  return Math.round(n * mult);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(TARGET_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `Upstream responded with ${upstream.status}` });
    }

    const html = await upstream.text();
    const $ = cheerio.load(html);

    const nominees = [];

    // <section id="nominees"><div class="grid"><div class="group">…
    $('#nominees .grid > div.group').each((_, el) => {
      const $el = $(el);

      // Image
      const $img = $el.find('img').first();
      const image = $img.attr('src') || $img.attr('data-src') || null;

      // Name: <p class="… font-bold …">
      const name = clean($el.find('p[class*="font-bold"]').first().text());

      // Unique ID: <p class="… text-zinc-300 …">
      const id = clean($el.find('p[class*="text-zinc-300"]').first().text());

      // Followers badge (top-right)
      const followersText = clean(
        $el.find('div[class*="right-2.5"]').first().text()
      );

      // Votes badge (top-left)
      const votesText = clean(
        $el.find('div[class*="left-2.5"]').first().text()
      );

      nominees.push({
        image,
        name,
        id,
        followers: followersText || null,
        followersCount: parseCount(followersText),
        votes: parseCount(votesText),
        votesRaw: votesText || null,
      });
    });

    // Cache on Vercel's CDN edge for 5 min
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({
      source: TARGET_URL,
      count: nominees.length,
      nominees,
    });
  } catch (err) {
    const message =
      err.name === 'AbortError' ? 'Upstream request timed out' : err.message;
    return res.status(500).json({ error: message });
  } finally {
    clearTimeout(timer);
  }
}
