import * as cheerio from 'cheerio';

const TARGET =
  'https://creativeawards.et/categories/01a0ecb7-050a-7301-b24f-1295e081dd6b';

export default async function handler(req, res) {
  try {
    const r = await fetch(TARGET, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = await r.text();
    const $ = cheerio.load(html);

    const nextData = $('#__NEXT_DATA__').html();
    const rscCount = (html.match(/self\.__next_f\.push/g) || []).length;
    const scriptSrcs = $('script[src]')
      .map((_, el) => $(el).attr('src'))
      .get();

    res.status(200).json({
      upstreamStatus: r.status,
      upstreamHeaders: Object.fromEntries(r.headers),
      htmlLength: html.length,

      // DOM checks
      hasSectionNominees: $('#nominees').length > 0,
      hasGrid: $('#nominees .grid').length > 0,
      groupStrict: $('#nominees .grid > div.group').length,
      groupLoose: $('#nominees div.group, #nominees .group').length,

      // JS-framework hints
      hasNextData: !!nextData,
      nextDataPreview: nextData ? nextData.slice(0, 400) : null,
      rscPushCount: rscCount,
      scriptSrcCount: scriptSrcs.length,
      scriptSrcSample: scriptSrcs.slice(0, 6),

      // Raw HTML snippet (only if we didn't find the section)
      bodySnippet:
        $('#nominees').length > 0
          ? null
          : html.slice(0, 1500).replace(/\s+/g, ' '),
    });
  } catch (err) {
    res.status(500).json({ error: String(err), stack: err.stack });
  }
}
