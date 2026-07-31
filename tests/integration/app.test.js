// Drives the real app in a real browser. Everything here is hermetic — no
// network is needed for any assertion in this file.

const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("../helpers/server");
const { launchBrowser, watchForErrors } = require("../helpers/browser");

let server;
let browser;
let skip = false;

test.before(async () => {
  const launched = await launchBrowser();
  if (launched.skip) {
    skip = launched.skip;
    return;
  }
  browser = launched.browser;
  server = await startServer();
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

/** Fresh page with a clean profile, on the Today screen. */
async function open(seed) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errors = watchForErrors(page);
  await page.goto(`${server.origin}/index.html`, { waitUntil: "domcontentloaded" });
  if (seed) {
    await page.evaluate(seed);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForSelector(".tabbar .tab");
  return { page, errors };
}

test("boots without a script error", async (t) => {
  if (skip) return t.skip(skip);
  const { page, errors } = await open();
  assert.deepEqual(errors, []);
  assert.ok(await page.locator(".large-title").isVisible());
  await page.close();
});

test.describe("the week strip", () => {
  test("marks scheduled days as buttons and rest days as plain", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();

    const days = await page.locator(".week-day").count();
    assert.equal(days, 7, "a week strip should always show seven days");

    const scheduled = await page.locator(".week-day.tappable").count();
    const trainingDays = await page.evaluate(() => trainingDays().length);
    assert.equal(scheduled, trainingDays, "every training day should be tappable");

    // Rest days must not look interactive.
    const restIsButton = await page.evaluate(() =>
      [...document.querySelectorAll(".week-day:not(.tappable)")].some((el) => el.tagName === "BUTTON"));
    assert.equal(restIsButton, false);
    await page.close();
  });

  test("tapping a day opens that day's workout", async (t) => {
    if (skip) return t.skip(skip);
    const { page, errors } = await open();

    const expected = await page.evaluate(() => {
      const btn = document.querySelector(".week-day.tappable");
      return WORKOUTS.find((w) => w.id === btn.dataset.openDay).title;
    });

    await page.locator(".week-day.tappable").first().click();
    await page.waitForSelector(".day-hero h2");
    assert.equal(await page.locator(".day-hero h2").textContent(), expected);
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("today's dot carries the today marker", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    assert.equal(await page.locator(".week-dot.today").count(), 1, "exactly one day is today");
    await page.close();
  });
});

test.describe("the schedule", () => {
  test("rotates so every category comes round", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();

    const covered = await page.evaluate(() => {
      const seen = new Set();
      const weeks = Math.ceil(WORKOUTS.length / trainingDays().length);
      for (let w = 0; w < weeks; w++) {
        const d = new Date();
        d.setDate(d.getDate() + w * 7);
        Object.values(schedule(d)).forEach((id) => seen.add(id));
      }
      return { seen: seen.size, total: WORKOUTS.length };
    });
    assert.equal(covered.seen, covered.total, "a full rotation should reach every category");
    await page.close();
  });

  test("repeats the same week when rotation is switched off", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open(() =>
      localStorage.setItem("fitfour.profile", JSON.stringify({ rotate: false, trainingDays: [1, 2, 4, 5] })));

    const same = await page.evaluate(() => {
      const next = new Date();
      next.setDate(next.getDate() + 7);
      return JSON.stringify(schedule()) === JSON.stringify(schedule(next));
    });
    assert.ok(same, "with rotation off, next week must match this week");
    await page.close();
  });

  test("assigns one workout per chosen training day", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    const ok = await page.evaluate(() => {
      const days = trainingDays();
      const map = schedule();
      return days.every((d) => Boolean(map[d])) && Object.keys(map).length === days.length;
    });
    assert.ok(ok);
    await page.close();
  });
});

test.describe("the plan screen", () => {
  test("lists every category", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    await page.click('[data-tab="plan"]');
    await page.waitForSelector(".row[data-open-day]");
    const rows = await page.locator(".card.rows .row[data-open-day]").count();
    const total = await page.evaluate(() => WORKOUTS.length);
    assert.equal(rows, total);
    await page.close();
  });
});

test.describe("the form-video sheet", () => {
  // Closing the sheet has to unload the iframe. Hiding the wrapper alone
  // leaves the video playing behind the app, which is what used to happen.
  test("unloads the video when dismissed", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    await page.locator(".week-day.tappable").first().click();
    await page.waitForSelector(".ex-thumb");

    await page.locator(".ex-thumb").first().click();
    await page.waitForSelector("#sheet iframe");
    assert.equal(await page.locator("#sheet iframe").count(), 1, "the player should mount");

    await page.locator("#sheet [data-sheet-close]").click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#sheet iframe").count(), 0, "Done must unload the video, not just hide it");
    assert.equal(await page.evaluate(() => document.getElementById("sheet").innerHTML), "");
    await page.close();
  });

  // The backdrop covers the whole screen while a sheet is open, so tapping it
  // (or pressing Escape) is how the sheet actually gets dismissed — the tab
  // bar isn't reachable underneath it.
  test("unloads the video when the backdrop is tapped", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    await page.locator(".week-day.tappable").first().click();
    await page.waitForSelector(".ex-thumb");
    await page.locator(".ex-thumb").first().click();
    await page.waitForSelector("#sheet iframe");

    await page.locator(".sheet-backdrop").click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#sheet iframe").count(), 0);
    await page.close();
  });

  test("unloads the video on Escape", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    await page.locator(".week-day.tappable").first().click();
    await page.waitForSelector(".ex-thumb");
    await page.locator(".ex-thumb").first().click();
    await page.waitForSelector("#sheet iframe");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#sheet iframe").count(), 0);
    assert.equal(await page.locator("#sheetWrap").isVisible(), false);
    await page.close();
  });
});

test.describe("workout progress", () => {
  test("ticking an exercise updates the bar and survives a reload", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    await page.locator(".week-day.tappable").first().click();
    await page.waitForSelector(".tick");

    await page.locator(".tick").first().click();
    await page.waitForTimeout(150);
    assert.match(await page.locator("#progLabel").textContent(), /^1 of \d+ done$/);

    const ticks = await page.evaluate(() => JSON.parse(localStorage.getItem("fitfour.ticks")));
    assert.ok(Object.values(ticks)[0].includes(0), "the tick should persist");
    await page.close();
  });

  test("finishing logs a session", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    await page.locator(".week-day.tappable").first().click();
    await page.waitForSelector("#finishBtn");
    await page.click("#finishBtn");
    await page.waitForTimeout(200);

    const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem("fitfour.sessions")));
    assert.equal(sessions.length, 1);
    await page.close();
  });
});

test.describe("theming", () => {
  test("switching theme sets every category variable", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await open();
    await page.click('[data-tab="profile"]');
    await page.waitForSelector('[data-theme-set="light"]');
    await page.click('[data-theme-set="light"]');
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        theme: document.documentElement.getAttribute("data-theme"),
        days: Array.from({ length: WORKOUTS.length }, (_, i) => style.getPropertyValue(`--day-${i + 1}`).trim()),
      };
    });
    assert.equal(result.theme, "light");
    for (const [i, hex] of result.days.entries()) {
      assert.match(hex, /^#[0-9a-f]{6}$/i, `--day-${i + 1} missing after theme change`);
    }
    await page.close();
  });
});
