// Service worker, offline mode, install and notifications, driven for real.
// Each spec gets a fresh browser context so one test's registered worker or
// cached shell can't leak into the next.

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

/** Isolated context, optionally with notifications already granted. */
async function open({ notifications = false, url = "/index.html" } = {}) {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  if (notifications) await context.grantPermissions(["notifications"], { origin: server.origin });
  const page = await context.newPage();
  const errors = watchForErrors(page);
  await page.goto(`${server.origin}${url}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tabbar .tab");
  return { context, page, errors };
}

const waitForController = (page) =>
  page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });

test.describe("service worker", () => {
  test("registers, activates and takes control", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page, errors } = await open();

    await waitForController(page);
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return { scope: reg?.scope, active: reg?.active?.state };
    });
    assert.equal(state.active, "activated");
    assert.ok(state.scope.endsWith("/"), `unexpected scope: ${state.scope}`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("does not reload the page on first install", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open();

    // clients.claim() fires controllerchange even for the very first worker.
    // Reloading there would bounce every new visitor once.
    await page.evaluate(() => { window.__marker = "survived"; });
    await waitForController(page);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => window.__marker), "survived",
      "the page reloaded on first install");
    await context.close();
  });

  test("precaches the shell", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open();
    await waitForController(page);

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const shell = names.find((n) => n.startsWith("fitfour-shell"));
      const keys = await (await caches.open(shell)).keys();
      return keys.map((r) => new URL(r.url).pathname);
    });
    for (const file of ["/index.html", "/style.css", "/app.js", "/music.js", "/notify.js"]) {
      assert.ok(cached.includes(file), `${file} was not precached`);
    }
    await context.close();
  });

  test("serves the app with the network cut off", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open();
    await waitForController(page);
    await page.waitForTimeout(600); // let the shell finish caching

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.waitForSelector(".tabbar .tab", { timeout: 10000 });
    assert.ok(await page.locator(".large-title").isVisible(), "the app should render offline");

    // Navigation between tabs is all local, so it must work too.
    await page.click('[data-tab="plan"]');
    await page.waitForSelector(".row[data-open-day]");
    assert.ok((await page.locator(".row[data-open-day]").count()) > 0);

    await context.setOffline(false);
    await context.close();
  });

  // The precache used to freeze shell files: a hit served from SHELL_CACHE was
  // revalidated into RUNTIME_CACHE, which caches.match never reached again. An
  // edited file then stayed invisible no matter how many times you reloaded.
  test("picks up an edited file on reload rather than serving a frozen copy", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open();
    await waitForController(page);
    await page.waitForTimeout(600);

    const before = server.hits("/app.js");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tabbar .tab");
    await page.waitForTimeout(400);

    assert.ok(
      server.hits("/app.js") > before,
      "the worker never re-fetched app.js — an edit would be invisible"
    );
    await context.close();
  });

  test("leaves third-party requests alone", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open();
    await waitForController(page);

    const handled = await page.evaluate(async () => {
      const names = await caches.keys();
      const runtime = names.filter((n) => n.startsWith("fitfour-"));
      const urls = [];
      for (const name of runtime) {
        const keys = await (await caches.open(name)).keys();
        urls.push(...keys.map((r) => r.url));
      }
      return urls.filter((u) => !u.startsWith(location.origin));
    });
    assert.deepEqual(handled, [], "no cross-origin response should ever be cached");
    await context.close();
  });
});

test.describe("manifest and icons", () => {
  test("is linked and every icon actually loads", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open();

    const manifestHref = await page.getAttribute('link[rel="manifest"]', "href");
    assert.ok(manifestHref);

    const result = await page.evaluate(async (href) => {
      const manifest = await (await fetch(href)).json();
      const checks = await Promise.all(
        manifest.icons.map(async (icon) => {
          const res = await fetch(icon.src);
          return { src: icon.src, ok: res.ok, type: res.headers.get("content-type") };
        })
      );
      return { name: manifest.name, checks };
    }, manifestHref);

    assert.ok(result.name);
    for (const check of result.checks) {
      assert.ok(check.ok, `icon failed to load: ${check.src}`);
    }
    await context.close();
  });
});

test.describe("launch shortcuts", () => {
  test("?tab=music opens Music and tidies the URL", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ url: "/index.html?tab=music" });

    assert.equal(await page.locator(".large-title").textContent(), "Music");
    assert.doesNotMatch(page.url(), /tab=/, "the query should be cleaned after launch");
    await context.close();
  });

  test("ignores a tab that doesn't exist", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page, errors } = await open({ url: "/index.html?tab=bogus" });
    assert.equal(await page.evaluate(() => route.tab), "today");
    assert.deepEqual(errors, []);
    await context.close();
  });
});

test.describe("install", () => {
  test("offers manual instructions when the browser gives no prompt", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open();
    await page.click('[data-tab="profile"]');
    await page.waitForSelector("#installBtn");

    // Chromium fires beforeinstallprompt inconsistently in automation, so the
    // fallback path is what a real Safari or Firefox user would hit.
    await page.click("#installBtn");
    await page.waitForSelector(".sheet .setup-steps");
    const text = await page.locator(".sheet").innerText();
    assert.match(text, /Add to Home Screen|Install app/);
    await context.close();
  });
});

test.describe("reminders", () => {
  test("are off until switched on", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open();
    await page.click('[data-tab="profile"]');
    await page.waitForSelector("[data-open-reminders]");
    assert.match(await page.locator("[data-open-reminders] .row-sub").textContent(), /Off/);
    await context.close();
  });

  test("switching on persists the setting and mirrors a plan for the worker", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page, errors } = await open({ notifications: true });
    await waitForController(page);

    await page.click('[data-tab="profile"]');
    await page.waitForSelector("[data-open-reminders]");
    await page.click("[data-open-reminders]");
    await page.waitForSelector("#remWorkout");
    await page.click("#remWorkout");
    await page.waitForTimeout(500);

    const saved = await page.evaluate(() => getNotifySettings());
    assert.equal(saved.workout, true);

    // The worker can't read localStorage, so the plan has to reach it via
    // Cache Storage or a closed-tab reminder could never fire.
    const plan = await page.evaluate(async () => {
      const cache = await caches.open("fitfour-plan");
      const res = await cache.match("/__fitfour_reminder_plan");
      return res ? res.json() : null;
    });
    assert.ok(plan, "no reminder plan was written for the service worker");
    assert.equal(plan.enabled, true);
    assert.match(plan.time, /^\d{2}:\d{2}$/);
    assert.ok(Array.isArray(plan.days) && plan.days.length > 0, "the plan needs the training days");
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("lead times toggle like calendar alerts", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ notifications: true });
    await page.evaluate(() =>
      localStorage.setItem("fitfour.notify", JSON.stringify({
        workout: true, time: "18:00", offsets: [30, 0], rest: true, fired: {},
      })));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tabbar .tab");
    await page.click('[data-tab="profile"]');
    await page.click("[data-open-reminders]");
    await page.waitForSelector(".lead-chip");

    assert.deepEqual(await page.evaluate(() => getNotifySettings().offsets), [30, 0]);
    assert.equal(await page.locator(".lead-chip.on").count(), 2);

    await page.click('.lead-chip[data-offset="60"]');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => getNotifySettings().offsets), [60, 30, 0],
      "a new lead time is added, longest first");

    await page.click('.lead-chip[data-offset="30"]');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => getNotifySettings().offsets), [60, 0]);
    await context.close();
  });

  test("refuses to remove the last lead time", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ notifications: true });
    await page.evaluate(() =>
      localStorage.setItem("fitfour.notify", JSON.stringify({
        workout: true, time: "18:00", offsets: [0], rest: true, fired: {},
      })));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tabbar .tab");
    await page.click('[data-tab="profile"]');
    await page.click("[data-open-reminders]");
    await page.waitForSelector(".lead-chip");

    // "Reminders on" with nothing selected would mean nothing ever arrives.
    await page.click('.lead-chip[data-offset="0"]');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => getNotifySettings().offsets), [0]);
    await context.close();
  });

  test("each lead time delivers its own notification", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ notifications: true });
    await waitForController(page);

    const shown = await page.evaluate(async () => {
      localStorage.setItem("fitfour.notify", JSON.stringify({
        workout: true, time: "18:00", offsets: [30, 0], rest: true, fired: {},
      }));
      fireWorkoutReminder("Chest today", "Lift", 30);
      fireWorkoutReminder("Chest today", "Lift", 0);
      await new Promise((r) => setTimeout(r, 700));
      const reg = await navigator.serviceWorker.ready;
      const notes = await reg.getNotifications();
      return notes.map((n) => ({ tag: n.tag, title: n.title }));
    });

    // Distinct tags, or the second would silently replace the first.
    assert.equal(shown.length, 2, `expected two notifications, got ${JSON.stringify(shown)}`);
    assert.ok(shown.some((n) => /30 min/i.test(n.title)), "no lead-time warning");
    assert.ok(shown.some((n) => n.title === "Chest today"), "no start-time alert");
    assert.equal(new Set(shown.map((n) => n.tag)).size, 2, "tags must be distinct");
    await context.close();
  });

  test("a fired lead time doesn't silence the others", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ notifications: true });
    await waitForController(page);

    const state = await page.evaluate(async () => {
      const today = dateKey();
      localStorage.setItem("fitfour.notify", JSON.stringify({
        workout: true, time: "18:00", offsets: [30, 0], rest: true, fired: { 30: today },
      }));
      const s = getNotifySettings();
      return {
        thirty: reminderDue({ settings: s, offset: 30, scheduledToday: true, doneToday: false, now: new Date(new Date().setHours(19, 0, 0, 0)) }),
        start: reminderDue({ settings: s, offset: 0, scheduledToday: true, doneToday: false, now: new Date(new Date().setHours(19, 0, 0, 0)) }),
      };
    });
    assert.equal(state.thirty, false, "already sent");
    assert.equal(state.start, true, "still owed");
    await context.close();
  });

  test("changing the time re-arms today", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ notifications: true });
    await page.evaluate(() =>
      localStorage.setItem("fitfour.notify", JSON.stringify({
        workout: true, time: "18:00", offsets: [30, 0], rest: true,
        fired: { 0: "2020-01-01", 30: "2020-01-01" },
      })));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tabbar .tab");

    await page.click('[data-tab="profile"]');
    await page.waitForSelector("[data-open-reminders]");
    await page.click("[data-open-reminders]");
    await page.waitForSelector("#remTime");
    await page.fill("#remTime", "07:30");
    await page.waitForTimeout(400);

    const saved = await page.evaluate(() => getNotifySettings());
    assert.equal(saved.time, "07:30");
    assert.deepEqual({ ...saved.fired }, {},
      "a new gym time should make every lead time eligible again");
    await context.close();
  });

  test("stays quiet while you're looking at the app", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ notifications: true });
    await waitForController(page);

    const shown = await page.evaluate(async () => {
      localStorage.setItem("fitfour.notify", JSON.stringify({
        workout: true, time: "00:01", offsets: [0], rest: true, fired: {},
      }));
      scheduleWorkoutReminder({ scheduledToday: true, doneToday: false, title: "Chest", body: "Lift" });
      await new Promise((r) => setTimeout(r, 500));
      const reg = await navigator.serviceWorker.ready;
      return (await reg.getNotifications({ tag: "workout-reminder-0" })).length;
    });

    assert.equal(shown, 0, "a visible app shouldn't interrupt with a reminder");
    assert.deepEqual(await page.evaluate(() => ({ ...getNotifySettings().fired })), {},
      "and it should stay eligible so it can still nudge once you leave");
    await context.close();
  });

  // Headless Chromium reports every page as visible — bringing another tab to
  // the front doesn't change it — so the backgrounded case can't be simulated
  // here. The visibility gate is covered by the spec above; this covers the
  // delivery path it guards: worker registration → showNotification → shown.
  test("delivers a reminder through the service worker", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ notifications: true });
    await waitForController(page);

    const shown = await page.evaluate(async () => {
      localStorage.setItem("fitfour.notify", JSON.stringify({
        workout: true, time: "00:01", offsets: [0], rest: true, fired: {},
      }));
      fireWorkoutReminder("Chest today", "Time to lift");
      await new Promise((r) => setTimeout(r, 600));
      const reg = await navigator.serviceWorker.ready;
      const notes = await reg.getNotifications({ tag: "workout-reminder-0" });
      return notes.map((n) => ({ title: n.title, body: n.body }));
    });

    assert.equal(shown.length, 1, "expected exactly one workout reminder");
    assert.equal(shown[0].title, "Chest today");
    assert.equal(await page.evaluate(() => Boolean(getNotifySettings().fired["0"])), true,
      "firing should mark that lead time as sent for today");
    await context.close();
  });

  test("does not fire on a rest day or once the session is done", async (t) => {
    if (skip) return t.skip(skip);
    const { context, page } = await open({ notifications: true });
    await waitForController(page);

    const counts = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const run = async (opts) => {
        localStorage.setItem("fitfour.notify", JSON.stringify({
          workout: true, time: "00:01", offsets: [0], rest: true, fired: {},
        }));
        scheduleWorkoutReminder({ title: "T", body: "B", ...opts });
        await new Promise((r) => setTimeout(r, 400));
        const notes = await reg.getNotifications({ tag: "workout-reminder-0" });
        notes.forEach((n) => n.close());
        return notes.length;
      };
      return {
        restDay: await run({ scheduledToday: false, doneToday: false }),
        alreadyDone: await run({ scheduledToday: true, doneToday: true }),
      };
    });

    assert.equal(counts.restDay, 0, "a rest day should never nudge");
    assert.equal(counts.alreadyDone, 0, "a finished session should never nudge");
    await context.close();
  });
});
