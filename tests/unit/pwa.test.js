// The manifest and the service worker's precache list are both plain data
// that nothing type-checks. A renamed file or a missing icon breaks
// installability or offline mode silently, so both are validated against what
// is actually on disk.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadApp, readSource, ROOT } = require("../helpers/sandbox");

const manifest = JSON.parse(readSource("manifest.json"));
const swSource = readSource("sw.js");
const indexHtml = readSource("index.html");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

test.describe("manifest", () => {
  test("has the fields an installable app needs", () => {
    for (const field of ["name", "short_name", "start_url", "scope", "display", "icons"]) {
      assert.ok(manifest[field], `manifest is missing ${field}`);
    }
    assert.ok(["standalone", "fullscreen", "minimal-ui"].includes(manifest.display),
      "display must be app-like for the install prompt to appear");
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  });

  test("short_name stays short enough for a home screen label", () => {
    assert.ok(manifest.short_name.length <= 12, `"${manifest.short_name}" will be truncated`);
  });

  test("ships the 192 and 512 raster icons Chrome requires", () => {
    const sizes = manifest.icons.filter((i) => i.type === "image/png").map((i) => i.sizes);
    for (const size of ["192x192", "512x512"]) {
      assert.ok(sizes.includes(size), `no PNG icon at ${size}`);
    }
  });

  test("ships a maskable icon so Android doesn't crop the artwork", () => {
    const maskable = manifest.icons.filter((i) => (i.purpose || "").split(/\s+/).includes("maskable"));
    assert.ok(maskable.length > 0, "no maskable icon declared");
    assert.ok(maskable.some((i) => i.sizes === "512x512"), "maskable should include 512x512");
  });

  test("every declared icon exists on disk", () => {
    for (const icon of manifest.icons) {
      assert.ok(exists(icon.src), `manifest points at a missing file: ${icon.src}`);
    }
  });

  test("start_url sits inside scope", () => {
    const scope = manifest.scope.replace(/^\.\//, "");
    const start = manifest.start_url.replace(/^\.\//, "");
    assert.ok(start.startsWith(scope), `start_url ${manifest.start_url} is outside scope ${manifest.scope}`);
  });

  test("shortcuts point at tabs the app actually has", () => {
    const tabs = ["today", "plan", "music", "progress", "profile"];
    for (const shortcut of manifest.shortcuts || []) {
      assert.ok(shortcut.name && shortcut.url, "a shortcut is missing name or url");
      const tab = new URL(shortcut.url, "https://x.test/").searchParams.get("tab");
      if (tab) assert.ok(tabs.includes(tab), `shortcut targets unknown tab: ${tab}`);
      for (const icon of shortcut.icons || []) {
        assert.ok(exists(icon.src), `shortcut icon missing: ${icon.src}`);
      }
    }
  });
});

test.describe("widgets", () => {
  // Windows 11's Widgets Board renders Adaptive Cards. Android and iOS have no
  // equivalent for web apps, so this is additive: an unknown manifest member
  // is ignored everywhere else and must not affect installability.
  test("declares a widget backed by files that exist", () => {
    if (!manifest.widgets) return; // optional feature
    for (const widget of manifest.widgets) {
      for (const field of ["name", "tag", "ms_ac_template", "data", "type"]) {
        assert.ok(widget[field], `widget is missing ${field}`);
      }
      assert.ok(exists(widget.ms_ac_template), `missing template: ${widget.ms_ac_template}`);
      assert.ok(exists(widget.data), `missing data file: ${widget.data}`);
      for (const icon of widget.icons || []) {
        assert.ok(exists(icon.src), `widget icon missing: ${icon.src}`);
      }
    }
  });

  test("the Adaptive Card is valid and binds only fields the worker supplies", () => {
    const template = JSON.parse(readSource("widgets/today-template.json"));
    const seed = JSON.parse(readSource("widgets/today-data.json"));

    assert.equal(template.type, "AdaptiveCard");
    assert.ok(template.version, "a card needs a schema version");

    // Every ${binding} in the card must have a value, or the widget renders blanks.
    const bindings = new Set(
      [...JSON.stringify(template).matchAll(/\$\{(\w+)\}/g)].map((m) => m[1])
    );
    assert.ok(bindings.size > 0, "the card binds nothing — is it still a template?");
    for (const key of bindings) {
      assert.ok(key in seed, `the card binds \${${key}} but the data file has no such field`);
      assert.ok(swSource.includes(`${key}:`), `the worker never supplies ${key}`);
    }
  });

  test("the worker handles the widget lifecycle", () => {
    for (const event of ["widgetinstall", "widgetresume", "widgetclick"]) {
      assert.match(swSource, new RegExp(`addEventListener\\("${event}"`), `no ${event} handler`);
    }
    // The card's action verb has to be one the worker actually recognises.
    const template = readSource("widgets/today-template.json");
    const verbs = [...template.matchAll(/"verb":\s*"([^"]+)"/g)].map((m) => m[1]);
    for (const verb of verbs) {
      assert.ok(swSource.includes(`"${verb}"`), `the card sends verb "${verb}" but nothing handles it`);
    }
  });
});

test.describe("index.html", () => {
  test("links the manifest and an apple-touch icon", () => {
    assert.match(indexHtml, /<link[^>]+rel="manifest"/, "no manifest link");
    // iOS ignores the manifest's icons entirely.
    const appleIcon = indexHtml.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/);
    assert.ok(appleIcon, "no apple-touch-icon");
    assert.ok(exists(appleIcon[1]), `apple-touch-icon missing on disk: ${appleIcon[1]}`);
  });

  test("loads every script the service worker precaches", () => {
    const scripts = [...indexHtml.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of scripts) {
      assert.ok(exists(src), `index.html loads a missing file: ${src}`);
      assert.ok(swSource.includes(`./${src}`), `${src} is loaded but not precached — it would break offline`);
    }
  });
});

test.describe("service worker", () => {
  test("precaches only files that exist", () => {
    const shell = [...swSource.matchAll(/^\s*"(\.\/[^"]*)",?$/gm)].map((m) => m[1].replace(/^\.\//, ""));
    assert.ok(shell.length > 5, "the shell list looks empty — did the format change?");
    for (const rel of shell) {
      if (rel === "") continue; // "./" is the directory index
      assert.ok(exists(rel), `sw.js precaches a file that doesn't exist: ${rel}`);
    }
  });

  test("carries a cache version that can be bumped", () => {
    assert.match(swSource, /const VERSION = "[^"]+"/, "no VERSION constant to invalidate old caches");
  });

  test("never intercepts cross-origin requests", () => {
    // Caching or replaying a media stream from YouTube/Spotify breaks playback.
    assert.match(swSource, /url\.origin !== self\.location\.origin/);
  });

  test("cleans up old caches on activate", () => {
    assert.match(swSource, /caches\.delete/);
  });

  test("handles notification clicks", () => {
    assert.match(swSource, /addEventListener\("notificationclick"/);
  });
});

test.describe("reminder logic", () => {
  const app = loadApp();
  const { msUntilReminder, reminderDue, getNotifySettings, saveNotifySettings } = app;

  const at = (h, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };

  test("measures the wait until today's reminder", () => {
    assert.equal(msUntilReminder(at(17, 0), "18:00"), 60 * 60 * 1000);
    assert.equal(msUntilReminder(at(18, 0), "18:00"), 0);
    assert.ok(msUntilReminder(at(19, 0), "18:00") < 0, "a passed time reads negative");
  });

  // Derived from DEFAULT_NOTIFY rather than a magic number, so changing the
  // default reminder time doesn't break this test — and so a second, disagreeing
  // fallback hidden inside parseHm can't creep back in.
  test("falls back to the configured default when the time is malformed", () => {
    const [h, m] = app.DEFAULT_NOTIFY.time.split(":").map(Number);
    // "::" matters: Number("") is 0, so a coercion-based parse reads it as
    // midnight instead of rejecting it.
    for (const bad of ["nonsense", "", undefined, null, "::", ":30", "25:00", "12:99"]) {
      assert.equal(msUntilReminder(at(h, m), bad), 0, `should fall back on ${String(bad)}`);
    }
  });

  test("accepts the times an input[type=time] can produce", () => {
    assert.equal(msUntilReminder(at(7, 30), "07:30"), 0);
    assert.equal(msUntilReminder(at(7, 30), "7:30"), 0, "a single-digit hour is still valid");
    assert.equal(msUntilReminder(at(0, 0), "00:00"), 0);
    assert.equal(msUntilReminder(at(23, 59), "23:59"), 0);
  });

  test("is not due when reminders are off", () => {
    assert.equal(
      reminderDue({ now: at(19), settings: { workout: false, time: "18:00" }, scheduledToday: true, doneToday: false }),
      false
    );
  });

  test("is not due before the time, and is due after", () => {
    const settings = { workout: true, time: "18:00", lastNotified: null };
    assert.equal(reminderDue({ now: at(17), settings, scheduledToday: true, doneToday: false }), false);
    assert.equal(reminderDue({ now: at(19), settings, scheduledToday: true, doneToday: false }), true);
  });

  test("is not due on a rest day or once the session is done", () => {
    const settings = { workout: true, time: "18:00", lastNotified: null };
    assert.equal(reminderDue({ now: at(19), settings, scheduledToday: false, doneToday: false }), false,
      "rest day should never nudge");
    assert.equal(reminderDue({ now: at(19), settings, scheduledToday: true, doneToday: true }), false,
      "already trained should never nudge");
  });

  const todayStamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  test("each lead time only nudges once a day", () => {
    const settings = { workout: true, time: "18:00", fired: { 0: todayStamp() } };
    assert.equal(reminderDue({ now: at(19), settings, scheduledToday: true, doneToday: false }), false);
  });

  test("lead times are independent of each other", () => {
    // The 30-minute nudge having gone out must not silence the start-time one.
    const settings = { workout: true, time: "18:00", fired: { 30: todayStamp() } };
    assert.equal(reminderDue({ now: at(19), settings, offset: 30, scheduledToday: true, doneToday: false }), false);
    assert.equal(reminderDue({ now: at(19), settings, offset: 0, scheduledToday: true, doneToday: false }), true);
  });

  test("a lead time comes due before the gym time", () => {
    const settings = { workout: true, time: "18:00", fired: {} };
    const due = (now, offset) => reminderDue({ now, settings, offset, scheduledToday: true, doneToday: false });

    assert.equal(due(at(17, 20), 30), false, "17:20 is too early for a 30-minute warning");
    assert.equal(due(at(17, 35), 30), true, "17:35 is past 17:30");
    assert.equal(due(at(17, 35), 0), false, "but the start-time alert isn't due yet");
  });

  test("measures the wait to each lead time", () => {
    assert.equal(app.msUntilOffset(0, at(17, 0), "18:00"), 60 * 60 * 1000);
    assert.equal(app.msUntilOffset(30, at(17, 0), "18:00"), 30 * 60 * 1000);
    assert.equal(app.msUntilOffset(60, at(17, 0), "18:00"), 0);
    assert.ok(app.msUntilOffset(120, at(17, 0), "18:00") < 0);
  });

  test("labels lead times the way a calendar would", () => {
    assert.equal(app.offsetLabel(0), "At start");
    assert.equal(app.offsetLabel(15), "15 min");
    assert.equal(app.offsetLabel(60), "1 hour");
    assert.equal(app.offsetLabel(120), "2 hours");
  });

  test("rejects lead times that aren't on offer, and orders them", () => {
    assert.deepEqual([...app.cleanOffsets([0, 30, 30, 999, "15"])], [30, 15, 0],
      "de-duped, filtered to known values, longest lead first");
    assert.deepEqual([...app.cleanOffsets(null)], []);
  });

  test("upgrades the older single-reminder setting", () => {
    // Before lead times existed there was one `lastNotified` date. It has to
    // become the start-time alert, or an existing user's reminder would either
    // vanish or fire twice on the day they upgrade.
    app.localStorage.setItem(
      "fitfour.notify",
      JSON.stringify({ workout: true, time: "07:15", rest: false, lastNotified: "2026-01-02" })
    );
    const migrated = getNotifySettings();

    assert.equal(migrated.workout, true);
    assert.equal(migrated.time, "07:15");
    assert.equal(migrated.rest, false);
    assert.deepEqual({ ...migrated.fired }, { 0: "2026-01-02" }, "the old date becomes the start-time alert");
    assert.equal(migrated.lastNotified, undefined, "the superseded field is dropped");
    assert.ok(migrated.offsets.length > 0, "and it gains the default lead times");
    app.localStorage.removeItem("fitfour.notify");
  });

  test("settings default sensibly and round-trip", () => {
    const defaults = getNotifySettings();
    assert.equal(defaults.workout, false, "reminders must be opt-in");
    assert.equal(defaults.rest, true);
    assert.match(defaults.time, /^\d{2}:\d{2}$/);

    saveNotifySettings({ workout: true, time: "07:30" });
    const saved = getNotifySettings();
    assert.equal(saved.workout, true);
    assert.equal(saved.time, "07:30");
    assert.equal(saved.rest, true, "unrelated settings should survive a patch");
  });
});
