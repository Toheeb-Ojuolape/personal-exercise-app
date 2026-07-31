// Categories sit next to each other in the Plan list and the week strip, so
// consecutive accents have to be tellable apart. An earlier version resampled
// a 4-colour ramp straight to 8 and produced two near-identical pinks for
// Back and Shoulders; these tests exist to stop that coming back.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers/sandbox");

const app = loadApp();
const { PALETTES, DAY_ACCENTS, expandDays, customPalette, resolvePalette, gradientCss, applyPalette, hexToRgb } = app;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Redmean colour distance — a cheap approximation of perceived difference
 * that's far better than raw RGB euclidean. Roughly: <40 reads as "the same
 * colour", >90 reads as clearly different.
 */
function distance(a, b) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const rMean = (x.r + y.r) / 2;
  const dr = x.r - y.r;
  const dg = x.g - y.g;
  const db = x.b - y.b;
  return Math.sqrt(
    (((512 + rMean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rMean) * db * db) >> 8)
  );
}

const ADJACENT_MIN = 60;

test.describe("expandDays", () => {
  test("produces one accent per category from every preset", () => {
    for (const preset of PALETTES) {
      const days = expandDays(preset.days);
      assert.equal(days.length, DAY_ACCENTS, `${preset.id} accent count`);
      for (const hex of days) assert.match(hex, HEX, `${preset.id} produced a bad colour`);
    }
  });

  test("keeps neighbouring categories visually distinct", () => {
    for (const preset of PALETTES) {
      const days = expandDays(preset.days);
      for (let i = 1; i < days.length; i++) {
        const d = distance(days[i - 1], days[i]);
        assert.ok(
          d >= ADJACENT_MIN,
          `${preset.id}: accents ${i} and ${i + 1} (${days[i - 1]} / ${days[i]}) are too close — distance ${d.toFixed(0)}`
        );
      }
    }
  });

  test("returns the input untouched when it's already long enough", () => {
    const stops = Array.from({ length: DAY_ACCENTS + 2 }, (_, i) => `#${String(i).padStart(2, "0")}00ff`);
    assert.deepEqual(expandDays(stops), stops.slice(0, DAY_ACCENTS));
  });
});

test.describe("customPalette", () => {
  test("builds a full, valid palette from two colours", () => {
    const p = customPalette("#7C4DFF", "#FF4D8D");
    assert.equal(p.id, "custom");
    assert.equal(p.days.length, DAY_ACCENTS);
    for (const hex of p.days) assert.match(hex, HEX);
    assert.match(p.brandDark, HEX);
    assert.match(p.brandLight, HEX);
  });

  test("separates neighbours like the presets do", () => {
    const p = customPalette("#2E9BFF", "#00D49A");
    for (let i = 1; i < p.days.length; i++) {
      assert.ok(
        distance(p.days[i - 1], p.days[i]) >= ADJACENT_MIN,
        `custom accents ${i}/${i + 1} too close: ${p.days[i - 1]} / ${p.days[i]}`
      );
    }
  });

  test("survives malformed input rather than throwing", () => {
    for (const bad of ["", "nonsense", "#xyz", null, undefined]) {
      const p = customPalette(bad, bad);
      assert.equal(p.days.length, DAY_ACCENTS, `failed on ${String(bad)}`);
      for (const hex of p.days) assert.match(hex, HEX);
    }
  });
});

test.describe("resolvePalette", () => {
  test("falls back to the first preset for an unknown id", () => {
    const p = resolvePalette({ id: "does-not-exist" });
    assert.equal(p.id, PALETTES[0].id);
    assert.equal(p.days.length, DAY_ACCENTS, "the fallback must be expanded too");
  });

  test("resolves the custom id through customPalette", () => {
    assert.equal(resolvePalette({ id: "custom", primary: "#FF0000", secondary: "#00FF00" }).id, "custom");
  });
});

test.describe("gradientCss", () => {
  test("handles two and three stops", () => {
    assert.match(gradientCss(["#000000", "#ffffff"]), /^linear-gradient\(135deg, #000000 0%, #ffffff 100%\)$/);
    assert.match(gradientCss(["#000000", "#888888", "#ffffff"]), /#888888 52%/);
  });
});

test.describe("applyPalette", () => {
  test("writes a CSS variable for every category", () => {
    applyPalette({ id: "ocean" });
    const style = app.document.documentElement.style;
    for (let i = 1; i <= DAY_ACCENTS; i++) {
      assert.match(style.getPropertyValue(`--day-${i}`), HEX, `--day-${i} was not set`);
    }
    assert.match(style.getPropertyValue("--brand"), HEX);
    assert.match(style.getPropertyValue("--grad-brand"), /^linear-gradient/);
  });
});
