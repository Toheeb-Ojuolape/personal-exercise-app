// Regenerate the PWA icon set from the same artwork as icon.svg.
//
//   node tools/make-icons.js
//
// Chrome's install criteria want raster icons at 192 and 512, and Android
// masks icons to whatever shape the launcher uses — so the maskable variant
// is drawn full-bleed with the mark inside the 80% safe zone, rather than
// reusing the rounded-square version and getting its corners clipped off.
//
// Playwright is a dev dependency; this is a build-time tool, never shipped.

const fs = require("node:fs");
const path = require("node:path");

const OUT = path.resolve(__dirname, "..", "icons");

const GRADIENT = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7C4DFF"/>
      <stop offset="0.55" stop-color="#B14DFF"/>
      <stop offset="1" stop-color="#FF4D8D"/>
    </linearGradient>
  </defs>`;

/** The dumbbell mark, scaled about the centre of a 512 canvas. */
const mark = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)"
     fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
    <path d="M168 168v176"/>
    <path d="M344 168v176"/>
    <path d="M112 214v84"/>
    <path d="M400 214v84"/>
    <path d="M168 256h176"/>
  </g>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${GRADIENT}
  <rect width="512" height="512" rx="114" fill="url(#g)"/>
  ${mark(1)}
</svg>`;

// Full bleed, mark at 72% so it survives a circular mask.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${GRADIENT}
  <rect width="512" height="512" fill="url(#g)"/>
  ${mark(0.72)}
</svg>`;

const TARGETS = [
  { file: "icon-192.png", svg: rounded, size: 192 },
  { file: "icon-512.png", svg: rounded, size: 512 },
  { file: "maskable-192.png", svg: maskable, size: 192 },
  { file: "maskable-512.png", svg: maskable, size: 512 },
  { file: "apple-touch-180.png", svg: rounded, size: 180 },
  // The badge Android puts in the status bar is masked to a circle and
  // rendered as a silhouette, so it has to be a solid white-on-transparent mark.
  {
    file: "badge-96.png",
    size: 96,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${mark(0.86)}</svg>`,
  },
];

// Same "find any usable Chromium" fallback the integration tests rely on, so
// this works whether or not `npx playwright install` has been run.
const { launchBrowser } = require("../tests/helpers/browser");

(async () => {
  const launched = await launchBrowser();
  if (launched.skip) {
    console.error(launched.skip);
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = launched.browser;

  for (const { file, svg, size } of TARGETS) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    );
    await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
    await page.close();
    console.log(`wrote icons/${file} (${size}×${size})`);
  }

  await browser.close();
})();
