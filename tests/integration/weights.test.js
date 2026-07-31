// Logging, editing and deleting weigh-ins. This is the only destructive
// editing in the app, and the entries feed the trend chart and the calorie
// targets — so identity, ordering and the profile sync are all pinned down.

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

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

/** Progress tab, optionally pre-seeded with weigh-ins and a profile. */
async function openProgress(weights, profile) {
  const page = await browser.newPage({ viewport: { width: 430, height: 950 } });
  const errors = watchForErrors(page);
  await page.goto(`${server.origin}/index.html`, { waitUntil: "domcontentloaded" });
  if (weights || profile) {
    await page.evaluate(([list, prof]) => {
      if (list) localStorage.setItem("fitfour.weights", JSON.stringify(list));
      if (prof) localStorage.setItem("fitfour.profile", JSON.stringify(prof));
    }, [weights, profile]);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForSelector(".tabbar .tab");
  await page.click('[data-tab="progress"]');
  await page.waitForSelector(".large-title");
  return { page, errors };
}

const readWeights = (page) => page.evaluate(() => getWeights());

test.describe("logging", () => {
  test("adds an entry and updates the profile weight", async (t) => {
    if (skip) return t.skip(skip);
    const { page, errors } = await openProgress();

    await page.click("#logWeightBtn");
    await page.waitForSelector("#wInput");
    await page.fill("#wInput", "82.5");
    await page.click("#saveWeightBtn");
    await page.waitForSelector(".log-row.tappable");

    const stored = await readWeights(page);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].kg, 82.5);
    assert.ok(stored[0].id, "every entry needs a stable id");
    assert.equal(await page.evaluate(() => getProfile().weightKg), 82.5);
    assert.deepEqual(errors, []);
    await page.close();
  });
});

test.describe("identity", () => {
  // Entries predate ids, and editing can change an entry's date — so the date
  // can't be used as identity and legacy rows have to be backfilled.
  test("gives pre-existing entries an id on first read", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openProgress([
      { date: daysAgo(2), kg: 80 },
      { date: daysAgo(1), kg: 79.5 },
    ]);

    const stored = await readWeights(page);
    assert.equal(stored.length, 2);
    for (const w of stored) assert.ok(w.id, "legacy entry was not given an id");
    assert.notEqual(stored[0].id, stored[1].id, "ids must be unique");

    // And the backfill must be persisted, not recomputed each read.
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("fitfour.weights")));
    assert.equal(persisted[0].id, stored[0].id);
    await page.close();
  });
});

test.describe("editing", () => {
  test("changes the weight and re-derives the profile target", async (t) => {
    if (skip) return t.skip(skip);
    const { page, errors } = await openProgress([
      { id: "w1", date: daysAgo(3), kg: 80 },
      { id: "w2", date: daysAgo(1), kg: 78 },
    ]);

    await page.click('[data-edit-weight="w2"]');
    await page.waitForSelector("#eWeight");
    await page.fill("#eWeight", "77.2");
    await page.click("#eSave");
    await page.waitForSelector(".log-row.tappable");

    const stored = await readWeights(page);
    assert.equal(stored.find((w) => w.id === "w2").kg, 77.2);
    assert.equal(stored.find((w) => w.id === "w1").kg, 80, "the other entry must be untouched");
    assert.equal(await page.evaluate(() => getProfile().weightKg), 77.2,
      "targets follow the latest weigh-in");
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("changes the date and re-sorts the log", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openProgress([
      { id: "w1", date: daysAgo(3), kg: 80 },
      { id: "w2", date: daysAgo(1), kg: 78 },
    ]);

    // Move the older entry to today — it becomes the most recent.
    await page.click('[data-edit-weight="w1"]');
    await page.waitForSelector("#eDate");
    const today = await page.evaluate(() => dateKey());
    await page.fill("#eDate", today);
    await page.click("#eSave");
    await page.waitForSelector(".log-row.tappable");

    const order = await page.evaluate(() => weightsDesc().map((w) => w.id));
    assert.deepEqual(order, ["w1", "w2"], "the log should re-sort by date");
    assert.equal(await page.evaluate(() => getProfile().weightKg), 80,
      "the newest entry now drives the target");
    await page.close();
  });

  test("refuses a future date", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openProgress([{ id: "w1", date: daysAgo(1), kg: 80 }]);

    await page.click('[data-edit-weight="w1"]');
    await page.waitForSelector("#eDate");
    const tomorrow = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return dateKey(d);
    });
    await page.fill("#eDate", tomorrow);
    await page.click("#eSave");
    await page.waitForTimeout(250);

    assert.ok(await page.locator("#eError").isVisible(), "should explain why it was rejected");
    assert.equal((await readWeights(page))[0].date.slice(0, 10), daysAgo(1).slice(0, 10),
      "nothing should have been saved");
    await page.close();
  });

  test("refuses a weight of zero or nonsense", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openProgress([{ id: "w1", date: daysAgo(1), kg: 80 }]);

    await page.click('[data-edit-weight="w1"]');
    await page.waitForSelector("#eWeight");
    await page.fill("#eWeight", "0");
    await page.click("#eSave");
    await page.waitForTimeout(250);

    assert.ok(await page.locator("#eError").isVisible());
    assert.equal((await readWeights(page))[0].kg, 80);
    await page.close();
  });

  test("keeps the time of day when only the date moves", async (t) => {
    if (skip) return t.skip(skip);
    const at = new Date();
    at.setDate(at.getDate() - 2);
    at.setHours(7, 15, 0, 0);

    const { page } = await openProgress([{ id: "w1", date: at.toISOString(), kg: 80 }]);
    await page.click('[data-edit-weight="w1"]');
    await page.waitForSelector("#eDate");
    await page.fill("#eDate", await page.evaluate(() => dateKey()));
    await page.click("#eSave");
    await page.waitForSelector(".log-row.tappable");

    const moved = new Date((await readWeights(page))[0].date);
    const clock = await page.evaluate((iso) => {
      const d = new Date(iso);
      return { h: d.getHours(), m: d.getMinutes() };
    }, moved.toISOString());
    assert.deepEqual(clock, { h: 7, m: 15 }, "a morning weigh-in should stay a morning weigh-in");
    await page.close();
  });
});

test.describe("deleting", () => {
  test("needs a second tap to confirm", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openProgress([{ id: "w1", date: daysAgo(1), kg: 80 }]);

    await page.click('[data-edit-weight="w1"]');
    await page.waitForSelector("#eDelete");
    await page.click("#eDelete");
    await page.waitForTimeout(200);

    assert.equal((await readWeights(page)).length, 1, "one tap must not delete anything");
    assert.match(await page.locator("#eDelete").innerText(), /Tap again/i);

    await page.click("#eDelete");
    await page.waitForTimeout(300);
    assert.equal((await readWeights(page)).length, 0, "the second tap should delete");
    await page.close();
  });

  test("removes only the chosen entry and re-derives the target", async (t) => {
    if (skip) return t.skip(skip);
    const { page, errors } = await openProgress([
      { id: "w1", date: daysAgo(3), kg: 80 },
      { id: "w2", date: daysAgo(2), kg: 79 },
      { id: "w3", date: daysAgo(1), kg: 78 },
    ]);

    // Delete the newest, so the target has to fall back to the one before it.
    await page.click('[data-edit-weight="w3"]');
    await page.waitForSelector("#eDelete");
    await page.click("#eDelete");
    await page.click("#eDelete");
    await page.waitForSelector(".log-row.tappable");

    const ids = await page.evaluate(() => weightsDesc().map((w) => w.id));
    assert.deepEqual(ids, ["w2", "w1"]);
    assert.equal(await page.evaluate(() => getProfile().weightKg), 79,
      "deleting the latest weigh-in should fall back to the previous one");
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("deleting the last entry returns the empty state", async (t) => {
    if (skip) return t.skip(skip);
    const { page, errors } = await openProgress(
      [{ id: "w1", date: daysAgo(1), kg: 80 }],
      { name: "Sam", age: 30, heightCm: 180, weightKg: 80, units: "metric" }
    );

    await page.click('[data-edit-weight="w1"]');
    await page.waitForSelector("#eDelete");
    await page.click("#eDelete");
    await page.click("#eDelete");
    await page.waitForTimeout(400);

    assert.equal(await page.locator(".log-row.tappable").count(), 0);
    assert.ok(await page.locator(".empty").first().isVisible(), "the empty state should return");
    // The profile keeps its last known weight — targets shouldn't blank out.
    assert.equal(await page.evaluate(() => getProfile().weightKg), 80);
    assert.deepEqual(errors, []);
    await page.close();
  });
});

test.describe("the log list", () => {
  test("shows the newest first and says when it's truncated", async (t) => {
    if (skip) return t.skip(skip);
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `w${i}`, date: daysAgo(10 - i), kg: 80 - i * 0.4,
    }));
    const { page } = await openProgress(many);

    assert.equal(await page.locator(".log-row.tappable").count(), 8, "the list caps at eight");
    const firstLabel = await page.locator(".log-row.tappable .log-date").first().textContent();
    assert.equal(firstLabel.trim(), "Yesterday", "newest weigh-in should lead");
    assert.match(await page.locator(".log-more").textContent(), /last 8 of 10/);
    await page.close();
  });
});
