/**
 * The other apps of the film: made up web pages in a plain browser frame,
 * shown in a stage window where the main window sits, for the beats that
 * happen over something else (the quick window, Grab from screen). Every
 * name, domain and word here is made up. Pages are self contained HTML.
 */

const FRAME_CSS = `
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body { font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; background: #f3f3f5; color: #1b1c1f; overflow: hidden; }
  .chrome { height: 78px; background: #ebebef; border-bottom: 1px solid #dcdce2; }
  .tabs { height: 38px; display: flex; align-items: flex-end; padding: 0 12px; }
  .tab { height: 32px; width: 250px; background: #fafafb; border-radius: 9px 9px 0 0; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 12px; color: #3a3b40; }
  .tab i { width: 14px; height: 14px; border-radius: 4px; background: var(--fav); flex: none; }
  .bar { height: 40px; background: #fafafb; display: flex; align-items: center; gap: 14px; padding: 0 14px; }
  .nav { display: flex; gap: 14px; color: #8a8b92; font-size: 14px; }
  .url { flex: 1; height: 28px; border-radius: 14px; background: #ededf1; display: flex; align-items: center; padding: 0 14px; font-size: 13px; color: #45464c; gap: 8px; }
  .url b { font-weight: 400; color: #8a8b92; }
  .page { height: calc(100% - 78px); overflow: hidden; background: #fff; }
`;

function frame(title: string, url: string, favicon: string, page: string, css: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${FRAME_CSS}${css}</style></head>
<body style="--fav:${favicon}">
  <div class="chrome">
    <div class="tabs"><div class="tab"><i></i>${title}</div></div>
    <div class="bar"><div class="nav">&#8592; &#8594; &#8635;</div><div class="url"><b>&#128274;</b>${url}</div></div>
  </div>
  <div class="page">${page}</div>
</body></html>`;
}

/** The brands a retail blog lists, for Grab from screen. */
export const ARTICLE_BRANDS: [string, string][] = [
  ['Hollow & Pine', 'Candles and home fragrance, poured by hand in Bristol.'],
  ['Field Day Coffee', 'Speciality roaster in Leeds with a subscription that sells out.'],
  ['Saltmarsh Skincare', 'Seaweed skincare from Brighton, now on high street shelves.'],
  ['Kestrel Cycling', 'Steel frame bikes built to order in Manchester.'],
  ['Marlow Knitwear', 'Jumpers knitted in their own Scottish mill.'],
  ['Ferro Cookware', 'Cast iron pans forged in Sheffield.'],
];

export function articlePage(): string {
  const items = ARTICLE_BRANDS.map(
    ([name, line], i) => `<li><span class="n">${String(i + 1).padStart(2, '0')}</span><div><h3>${name}</h3><p>${line}</p></div></li>`,
  ).join('');
  return frame(
    '12 UK brands to watch in 2026',
    'retailnotes.co.uk/brands-to-watch-2026',
    '#d9534f',
    `<header><span class="logo">Retail Notes</span><nav>News &nbsp; Brands &nbsp; Ecommerce &nbsp; Newsletter</nav></header>
     <article>
       <div class="kicker">Brands</div>
       <h1>12 independent UK brands to watch in 2026</h1>
       <div class="by">By the Retail Notes team &middot; 6 min read</div>
       <ol data-film-list>${items}</ol>
     </article>`,
    `
    header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 64px; border-bottom: 1px solid #eee; }
    .logo { font-family: Georgia, serif; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    nav { font-size: 13px; color: #6b6c72; }
    article { width: 720px; margin: 36px auto 0; }
    .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #d9534f; font-weight: 600; }
    h1 { font-family: Georgia, serif; font-size: 34px; line-height: 1.15; letter-spacing: -0.02em; margin-top: 8px; }
    .by { font-size: 13px; color: #8a8b92; margin-top: 10px; }
    ol { list-style: none; padding: 0; margin-top: 26px; }
    li { display: flex; gap: 18px; padding: 11px 0; border-top: 1px solid #f0f0f2; }
    .n { font-family: Georgia, serif; color: #c3c4c9; font-size: 18px; width: 26px; }
    h3 { font-size: 17px; font-weight: 600; }
    p { font-size: 14px; color: #5d5e64; margin-top: 2px; }
    `,
  );
}

/** One brand's own site, for the quick window's "Find contacts at" row. */
export function brandPage(): string {
  return frame(
    'Hollow & Pine | Candles poured in Bristol',
    'hollowandpine.co.uk',
    '#3f5a46',
    `<header><span class="logo">Hollow &amp; Pine</span><nav>Candles &nbsp; Diffusers &nbsp; Gifts &nbsp; Our story</nav><span class="bag">Bag (0)</span></header>
     <section class="hero">
       <div class="copy">
         <div class="kicker">Certified B Corp</div>
         <h1>Slow burning candles,<br>poured by hand in Bristol.</h1>
         <p>Soy wax, cotton wicks and scents from English woodland. Free delivery over &pound;40.</p>
         <span class="cta">Shop the collection</span>
       </div>
       <div class="art"><div class="jar a"></div><div class="jar b"></div><div class="jar c"></div></div>
     </section>`,
    `
    .page { background: #f6f1e9; }
    header { height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 64px; }
    .logo { font-family: Georgia, serif; font-size: 24px; color: #2e3a30; }
    nav, .bag { font-size: 14px; color: #4c5a4e; }
    .hero { display: flex; align-items: center; gap: 48px; padding: 56px 64px 0; }
    .copy { flex: 1; }
    .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: #7b8b6f; font-weight: 600; }
    h1 { font-family: Georgia, serif; font-weight: 400; font-size: 48px; line-height: 1.08; color: #26302a; margin-top: 14px; letter-spacing: -0.02em; }
    .copy p { font-size: 16px; color: #5b665b; margin-top: 18px; max-width: 420px; line-height: 1.5; }
    .cta { display: inline-block; margin-top: 26px; background: #2e3a30; color: #f6f1e9; padding: 13px 22px; border-radius: 999px; font-size: 14px; }
    .art { flex: 1; height: 380px; position: relative; }
    .jar { position: absolute; bottom: 20px; border-radius: 22px 22px 16px 16px; box-shadow: 0 30px 50px -20px rgba(60, 50, 30, 0.35); }
    .jar.a { left: 20px; width: 150px; height: 210px; background: linear-gradient(160deg, #d9cbb3, #b8a383); }
    .jar.b { left: 160px; width: 170px; height: 260px; background: linear-gradient(160deg, #6f8571, #48604c); z-index: 1; }
    .jar.c { left: 310px; width: 140px; height: 180px; background: linear-gradient(160deg, #e8dccb, #cdbb9d); }
    `,
  );
}

export const toDataUrl = (html: string): string => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
