// Colour themes. A palette drives the brand colour, the brand gradient, and
// the four per-workout accents — everything else (surfaces, text, success and
// danger) stays semantic so contrast and meaning hold across every theme.

const PALETTE_KEY = "fitfour.palette";

const PALETTES = [
  {
    id: "violet",
    name: "Violet",
    brandDark: "#8B6DFF",
    brandLight: "#6D3FFF",
    grad: ["#7C4DFF", "#B14DFF", "#FF4D8D"],
    days: ["#7C4DFF", "#FF4D8D", "#2E9BFF", "#00D49A"],
  },
  {
    id: "ocean",
    name: "Ocean",
    brandDark: "#4FC3FF",
    brandLight: "#0F76D6",
    grad: ["#2E9BFF", "#00B8D4", "#00D49A"],
    days: ["#2E9BFF", "#00B8D4", "#5B7CFF", "#00C48F"],
  },
  {
    id: "sunset",
    name: "Sunset",
    brandDark: "#FFA05C",
    brandLight: "#DD5A18",
    grad: ["#FFB020", "#FF6B4D", "#FF4D8D"],
    days: ["#FFB020", "#FF6B4D", "#FF4D8D", "#C24DFF"],
  },
  {
    id: "forest",
    name: "Forest",
    brandDark: "#54DE86",
    brandLight: "#12904A",
    grad: ["#00C48F", "#4ADE80", "#A3E635"],
    days: ["#00C48F", "#4ADE80", "#8CC63F", "#14B8A6"],
  },
  {
    id: "crimson",
    name: "Crimson",
    brandDark: "#FF7A93",
    brandLight: "#D01E45",
    grad: ["#FF4D6D", "#F5246F", "#B4177A"],
    days: ["#FF4D6D", "#F5246F", "#B4177A", "#FF8A5C"],
  },
  {
    id: "slate",
    name: "Slate",
    brandDark: "#A9B6CC",
    brandLight: "#4A5A72",
    grad: ["#5B7085", "#8B9AB4", "#B7C3D6"],
    days: ["#5B7085", "#8393AE", "#46566E", "#9AA8C0"],
  },
];

const DEFAULT_CUSTOM = { primary: "#7C4DFF", secondary: "#FF4D8D" };

// ---------- colour maths ----------
function hexToRgb(hex) {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return Number.isFinite(n) && full.length === 6
    ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    : { r: 124, g: 77, b: 255 };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][Math.floor(h / 60) % 6];
  const to = (v) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(seg[0])}${to(seg[1])}${to(seg[2])}`;
}

const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Interpolate hue the short way around the wheel. */
function lerpHue(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

/**
 * Build a full palette from two user-chosen colours: the four day accents are
 * sampled along the gradient between them, so they stay in the same family.
 */
function customPalette(primary, secondary) {
  const a = hexToHsl(primary);
  const b = hexToHsl(secondary);
  const lerp = (x, y, t) => x + (y - x) * t;

  const days = [0, 1 / 3, 2 / 3, 1].map((t) =>
    hslToHex(
      lerpHue(a.h, b.h, t),
      clamp(lerp(a.s, b.s, t), 0.45, 0.95),
      clamp(lerp(a.l, b.l, t), 0.44, 0.68)
    )
  );

  const sat = clamp(Math.max(a.s, 0.55), 0, 0.95);
  return {
    id: "custom",
    name: "Custom",
    brandDark: hslToHex(a.h, sat, 0.7),
    brandLight: hslToHex(a.h, sat, 0.47),
    grad: [primary, secondary],
    days,
  };
}

// ---------- storage + application ----------
function getPaletteChoice() {
  try {
    const v = JSON.parse(localStorage.getItem(PALETTE_KEY));
    return v && typeof v === "object" ? v : { id: "violet" };
  } catch {
    return { id: "violet" };
  }
}

function savePaletteChoice(choice) {
  localStorage.setItem(PALETTE_KEY, JSON.stringify(choice));
}

/** The active choice resolved to concrete colours. */
function resolvePalette(choice = getPaletteChoice()) {
  if (choice.id === "custom") {
    return customPalette(
      choice.primary || DEFAULT_CUSTOM.primary,
      choice.secondary || DEFAULT_CUSTOM.secondary
    );
  }
  return PALETTES.find((p) => p.id === choice.id) || PALETTES[0];
}

function gradientCss(grad) {
  const stops =
    grad.length === 2
      ? `${grad[0]} 0%, ${grad[1]} 100%`
      : `${grad[0]} 0%, ${grad[1]} 52%, ${grad[2]} 100%`;
  return `linear-gradient(135deg, ${stops})`;
}

/**
 * Write the palette onto :root. --brand is theme-dependent, so this must run
 * again whenever light/dark changes.
 */
function applyPalette(choice = getPaletteChoice()) {
  const p = resolvePalette(choice);
  const st = document.documentElement.style;
  const isLight = document.documentElement.getAttribute("data-theme") === "light";

  st.setProperty("--brand", isLight ? p.brandLight : p.brandDark);
  st.setProperty("--grad-brand", gradientCss(p.grad));
  p.days.forEach((c, i) => st.setProperty(`--day-${i + 1}`, c));
}
