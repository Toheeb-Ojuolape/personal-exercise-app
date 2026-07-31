// FitFour service worker — offline shell, update flow, and reminders.
//
// Bump VERSION whenever a cached file changes. There's no build step to hash
// filenames, so this string is what tells an installed copy that its cache is
// stale and a fresh shell should be fetched.
const VERSION = "v2";
const SHELL_CACHE = `fitfour-shell-${VERSION}`;
const RUNTIME_CACHE = `fitfour-runtime-${VERSION}`;

// Where the page leaves a summary the worker can read. Reminders have to work
// when no tab is open, and a worker can't reach localStorage — so the plan is
// mirrored into Cache Storage, which it can.
const PLAN_URL = "/__fitfour_reminder_plan";
const PLAN_CACHE = "fitfour-plan";

const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./workouts.js",
  "./icons.js",
  "./palette.js",
  "./profile.js",
  "./spotify.js",
  "./music.js",
  "./notify.js",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-180.png",
  "./icons/badge-96.png",
  "./widgets/today-template.json",
  "./widgets/today-data.json",
];

// ---------------------------------------------------------------- lifecycle
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll is all-or-nothing; one 404 would leave the app with no cache at
      // all, so each file is allowed to fail on its own.
      Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("fitfour-") && k !== SHELL_CACHE && k !== RUNTIME_CACHE && k !== PLAN_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// The page asks for this once the user accepts an update.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "SHOW_NOTIFICATION") {
    event.waitUntil(showReminder(data.payload || {}));
  }
});

// ---------------------------------------------------------------- fetch
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Third-party players and their APIs must never be intercepted — caching or
  // replaying a media stream breaks playback and burns storage.
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network so an updated shell lands promptly, and fall
  // back to the cached page so the app opens with no connection at all.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(async () =>
          (await caches.match("./index.html")) ||
          (await caches.match("./")) ||
          new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
        )
    );
    return;
  }

  // On a dev origin the network wins, so an edited file shows up on reload.
  // The cache is still filled and still answers when offline — this only
  // changes which one is consulted first.
  if (isDevOrigin) {
    event.respondWith(
      fetch(request)
        .then((response) => store(request, response))
        .catch(async () => (await caches.match(request)) || Response.error())
    );
    return;
  }

  // Otherwise: serve from cache immediately, refresh behind.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => store(request, response))
        .catch(() => cached);
      return cached || network;
    })
  );
});

const DEV_HOSTS = ["localhost", "127.0.0.1", "[::1]", ""];
const isDevOrigin = DEV_HOSTS.includes(self.location.hostname);

/** Which cache already holds this request, if any. */
async function holdingCache(request) {
  for (const name of [SHELL_CACHE, RUNTIME_CACHE]) {
    const cache = await caches.open(name);
    if (await cache.match(request)) return name;
  }
  return null;
}

/**
 * Write a fresh response back into whichever cache already held it. Always
 * writing to the runtime cache was a bug: a hit served from the precached
 * shell would never be refreshed, so shell files stayed frozen at whatever
 * VERSION installed them — updates silently never arrived.
 */
async function store(request, response) {
  if (!response || response.status !== 200 || response.type !== "basic") return response;
  const copy = response.clone();
  const target = (await holdingCache(request)) || RUNTIME_CACHE;
  const cache = await caches.open(target);
  await cache.put(request, copy);
  return response;
}

// ---------------------------------------------------------------- reminders
async function readPlan() {
  try {
    const cache = await caches.open(PLAN_CACHE);
    const res = await cache.match(PLAN_URL);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

async function writePlan(plan) {
  const cache = await caches.open(PLAN_CACHE);
  await cache.put(PLAN_URL, new Response(JSON.stringify(plan), {
    headers: { "Content-Type": "application/json" },
  }));
}

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function showReminder({ title, body, tag = "fitfour", data = {}, renotify = false }) {
  return self.registration.showNotification(title || "FitFour", {
    body: body || "",
    tag,
    renotify,
    icon: "./icons/icon-192.png",
    badge: "./icons/badge-96.png",
    data,
  });
}

/**
 * Chrome can wake an installed PWA on a schedule. It's the only way a reminder
 * arrives with every tab closed, so it's wired up where available — but the
 * browser decides both whether and when it runs, so the in-page timer stays
 * the primary path.
 */
self.addEventListener("periodicsync", (event) => {
  if (event.tag !== "workout-reminder") return;
  event.waitUntil(maybeRemind());
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "workout-reminder") return;
  event.waitUntil(maybeRemind());
});

const offsetLabel = (mins) => {
  if (mins === 0) return "at start";
  if (mins < 60) return `${mins} min`;
  return mins === 60 ? "1 hour" : `${mins / 60} hours`;
};

async function maybeRemind() {
  const plan = await readPlan();
  if (!plan?.enabled) return;

  const now = new Date();
  const today = dayKey(now);
  if (!plan.days?.includes(now.getDay())) return; // not a training day
  if (plan.doneOn === today) return; // already trained

  const match = /^(\d{1,2}):(\d{2})$/.exec(String(plan.time || ""));
  if (!match) return;
  const target = Number(match[1]) * 60 + Number(match[2]);
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const fired = { ...(plan.fired || {}) };
  const offsets = Array.isArray(plan.offsets) && plan.offsets.length ? plan.offsets : [0];

  // A background wake-up is rare and imprecise, so only the most urgent lead
  // time that is genuinely due gets sent — firing a backlog of three at once
  // would be worse than sending nothing.
  const due = offsets
    .filter((o) => fired[String(o)] !== today && minutesNow >= target - Number(o))
    .sort((a, b) => a - b)[0];
  if (due === undefined) return;

  await showReminder({
    title: Number(due) === 0 ? plan.title || "Time to train" : `Gym in ${offsetLabel(Number(due))}`,
    body: Number(due) === 0 ? plan.body || "Your session is waiting." : plan.title || "Your session is coming up.",
    tag: `workout-reminder-${due}`,
    data: { url: "./index.html" },
  });

  fired[String(due)] = today;
  await writePlan({ ...plan, fired });
}

// ---------------------------------------------------------------- widget
// The Windows 11 Widgets Board renders Adaptive Cards, not HTML, and drives
// them from these events. Android and iOS have no equivalent for web apps —
// their home-screen widgets require a native app — so this is Windows-only
// and simply never fires elsewhere.
const WIDGET_TAG = "fitfour-today";

/** Build the card's data from the plan the page mirrors into Cache Storage. */
async function widgetData() {
  const plan = await readPlan();
  const resting = plan && plan.scheduledToday === false;
  const done = plan?.doneOn === dayKey();

  return {
    eyebrow: done ? "COMPLETED" : resting ? "REST DAY" : "TODAY'S SESSION",
    title: resting ? "Rest day" : plan?.title || "Open FitFour",
    subtitle: done
      ? "Session logged. Good work."
      : resting
        ? "Recovery is where the muscle is built."
        : plan?.body || "Your plan loads as soon as the app runs once.",
    weekDone: String(plan?.weekDone ?? 0),
    weekTarget: String(plan?.weekTarget ?? 4),
    streak: String(plan?.streak ?? 0),
    cta: done || resting ? "Open FitFour" : "Start workout",
  };
}

async function renderWidget(widget) {
  if (!self.widgets || !widget) return;
  try {
    await self.widgets.updateByTag(widget.tag ?? WIDGET_TAG, {
      template: JSON.stringify(widget.definition?.msAcTemplate ?? {}),
      data: JSON.stringify(await widgetData()),
    });
  } catch {
    /* the board may have gone away between the event and the update */
  }
}

self.addEventListener("widgetinstall", (event) =>
  event.waitUntil(renderWidget(event.widget))
);
self.addEventListener("widgetresume", (event) =>
  event.waitUntil(renderWidget(event.widget))
);
self.addEventListener("widgetclick", (event) => {
  if (event.action === "open-today") {
    event.waitUntil(self.clients.openWindow?.("./index.html?tab=today"));
    return;
  }
  event.waitUntil(renderWidget(event.widget));
});

// ---------------------------------------------------------------- clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./index.html", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer surfacing a tab that's already open over stacking up new ones.
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", action: event.action, data: event.notification.data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});
