/**
 * Renders the images chat apps and home screens show for lgtm.page:
 * public/og.png (1200x630, the link preview) and public/apple-touch-icon.png
 * (180x180, from public/favicon.svg). The preview is "LGTM" with the
 * "approved" check beside a fan of placeholder app cards.
 *
 *   pnpm og
 */
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WIDTH = 1200;
const HEIGHT = 630;
const ROOT = path.resolve(import.meta.dirname, "../..");
const FONT = path.join(
  ROOT,
  "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
);

// Palette: the oklch tokens from src/index.css.
const C = {
  background: "oklch(0.16 0.02 270)",
  foreground: "oklch(0.97 0.005 270)",
  card: "oklch(0.21 0.025 270)",
  muted: "oklch(0.26 0.025 270)",
  mutedForeground: "oklch(0.72 0.02 270)",
  border: "oklch(1 0 0 / 10%)",
  primary: "oklch(0.8 0.18 150)",
} as const;

/** Card art hues: one per placeholder card. */
const HUES = [290, 230, 25, 85];

const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="${C.primary}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;

function card(hue: number, i: number): string {
  const x = 610 + i * 120;
  const y = 120 + i * 70;
  const rotate = -8 + i * 5;
  return `<div class="card" style="left:${x}px;top:${y}px;transform:rotate(${rotate}deg)">
    <div class="art" style="background:radial-gradient(circle at 30% 25%, oklch(0.62 0.15 ${hue}), oklch(0.28 0.08 ${hue}))"></div>
    <div class="line" style="width:55%"></div>
    <div class="line short" style="width:85%"></div>
    <div class="line short" style="width:65%"></div>
  </div>`;
}

async function fontFace(): Promise<string> {
  const font = (await readFile(FONT)).toString("base64");
  return `@font-face { font-family: Geist; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }`;
}

async function ogHtml(): Promise<string> {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${await fontFace()}
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    background: ${C.background};
    color: ${C.foreground};
    font-family: Geist, system-ui, sans-serif;
    position: relative;
  }
  .glow {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 560px 360px at 18% 40%, oklch(0.8 0.18 150 / 0.14), transparent 70%),
      radial-gradient(ellipse 700px 500px at 85% 60%, oklch(0.35 0.08 270 / 0.55), transparent 70%);
  }
  .card {
    position: absolute; width: 340px; padding-bottom: 22px;
    border-radius: 22px; overflow: hidden;
    background: ${C.card}; border: 2px solid ${C.border};
    box-shadow: 0 30px 60px oklch(0 0 0 / 0.45);
  }
  .art { height: 178px; border-bottom: 2px solid ${C.border}; }
  .line { height: 16px; margin: 20px 22px 0; border-radius: 8px; background: ${C.foreground}; opacity: 0.85; }
  .line.short { height: 11px; margin-top: 12px; background: ${C.mutedForeground}; opacity: 0.5; }
  header { position: absolute; left: 72px; top: 170px; width: 560px; }
  .mark { width: 120px; height: 120px; margin-bottom: 26px; }
  h1 { font-size: 104px; font-weight: 800; letter-spacing: -0.045em; line-height: 1; }
  p { margin-top: 20px; font-size: 34px; font-weight: 500; color: ${C.mutedForeground}; line-height: 1.25; }
</style></head>
<body>
  <div class="glow"></div>
  ${HUES.map(card).join("")}
  <header>
    <div class="mark">${CHECK}</div>
    <h1>LGTM</h1>
    <p>Vibe-coded web apps.<br />Looks good to me.</p>
  </header>
</body></html>`;
}

async function iconHtml(size: number): Promise<string> {
  const svg = await readFile(path.join(ROOT, "public/favicon.svg"), "utf8");
  return `<!doctype html><html><head><style>
    * { margin: 0; } html, body { width: ${size}px; height: ${size}px; overflow: hidden; }
    svg { display: block; width: ${size}px; height: ${size}px; }
  </style></head><body>${svg}</body></html>`;
}

async function render(
  file: string,
  html: string,
  width: number,
  height: number,
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png" });
  const out = path.join(ROOT, file);
  await writeFile(out, png);
  console.log(`wrote ${file} (${png.byteLength} bytes)`);
  await page.close();
}

const browser = await chromium.launch();
try {
  await render("public/og.png", await ogHtml(), WIDTH, HEIGHT);
  await render("public/apple-touch-icon.png", await iconHtml(180), 180, 180);
} finally {
  await browser.close();
}
