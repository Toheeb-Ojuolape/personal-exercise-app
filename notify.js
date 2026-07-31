// ============================================================
// FitFour — install, updates and reminders.
//
// What a static, serverless PWA can and can't do with notifications, plainly:
//
//   Works: a reminder fired while the app is open or backgrounded; a rest
//   timer that finishes after you've switched apps; a catch-up nudge the
//   moment you reopen the app having missed one.
//
//   Best effort: reminders with every tab closed. Chrome can wake an
//   installed PWA through Periodic Background Sync, so that's wired up, but
//   the browser decides whether and when it runs — and Safari has no
//   equivalent at all.
//
//   Not possible here: guaranteed delivery at an exact time with the app
//   closed. That needs Web Push, which needs a server holding VAPID keys to
//   push to. This app has no backend by design.
// ============================================================

const NOTIFY_KEY = "fitfour.notify";
const PLAN_CACHE = "fitfour-plan";
const PLAN_URL = "/__fitfour_reminder_plan";

// Lead times offered in the UI, longest first. 0 means "at the gym time".
const REMINDER_OFFSETS = [120, 60, 30, 15, 10, 5, 0];

const DEFAULT_NOTIFY = {
  workout: false, // daily nudge on training days
  time: "19:00", // when you plan to be training
  offsets: [30, 0], // minutes before that time to nudge, like a calendar invite
  rest: true, // rest timer finished while you're in another app
  fired: {}, // { "<offset>": "yyyy-mm-dd" } — each lead time nudges once a day
};

const offsetLabel = (mins) => {
  if (mins === 0) return "At start";
  if (mins < 60) return `${mins} min`;
  return mins === 60 ? "1 hour" : `${mins / 60} hours`;
};

/** Keep only offsets we actually offer, longest lead time first. */
const cleanOffsets = (list) =>
  [...new Set((Array.isArray(list) ? list : []).map(Number))]
    .filter((n) => REMINDER_OFFSETS.includes(n))
    .sort((a, b) => b - a);

/**
 * Read settings, upgrading the older single-reminder shape on the way. That
 * version stored one `lastNotified` date; it becomes the "at start" lead time
 * so an existing user's reminder keeps working untouched.
 */
const nRead = () => {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(NOTIFY_KEY)) || {};
  } catch {
    stored = {};
  }

  const settings = { ...DEFAULT_NOTIFY, ...stored };
  settings.offsets = cleanOffsets(stored.offsets ?? DEFAULT_NOTIFY.offsets);
  if (!settings.offsets.length) settings.offsets = [0];

  settings.fired = stored.fired && typeof stored.fired === "object" ? { ...stored.fired } : {};
  if (stored.lastNotified && !stored.fired) settings.fired = { 0: stored.lastNotified };
  delete settings.lastNotified;

  return settings;
};
const nWrite = (patch) => {
  const next = { ...nRead(), ...patch };
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(next)); } catch {}
  return next;
};

const getNotifySettings = nRead;
const saveNotifySettings = nWrite;

// ---------------------------------------------------------------- capability
const notifySupported = () => "Notification" in window && "serviceWorker" in navigator;
const notifyPermission = () => (notifySupported() ? Notification.permission : "unsupported");
const notifyGranted = () => notifyPermission() === "granted";

/** Standalone means it was installed to a home screen or dock. */
const isInstalled = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

async function requestNotifyPermission() {
  if (!notifySupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// ---------------------------------------------------------------- service worker
let swRegistration = null;
let updateReady = null; // the waiting worker, once one exists

/** Registers the worker and reports when a new version is ready to take over. */
async function registerServiceWorker(onUpdate) {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    swRegistration = reg;

    if (reg.waiting && navigator.serviceWorker.controller) {
      updateReady = reg.waiting;
      onUpdate?.();
    }

    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // A worker that installs with no controller is the very first one —
        // that's a fresh install, not an update to announce.
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          updateReady = installing;
          onUpdate?.();
        }
      });
    });

    // Reload once a *replacement* worker takes control, so the page matches
    // the assets it will now be served. The first worker to activate also
    // fires this when it calls clients.claim() — reloading there would bounce
    // every first-time visitor for no reason, so it's ignored.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });

    return reg;
  } catch {
    return null; // an unregistered worker just means no offline support
  }
}

function applyUpdate() {
  updateReady?.postMessage({ type: "SKIP_WAITING" });
}

// ---------------------------------------------------------------- showing
/**
 * Prefer the service worker: its notifications outlive the page, and only it
 * can carry actions. Falls back to a page notification when there's no worker.
 */
async function showNotification(payload) {
  if (!notifyGranted()) return false;
  const reg = swRegistration || (await navigator.serviceWorker?.ready.catch(() => null));

  if (reg?.showNotification) {
    await reg.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag || "fitfour",
      renotify: Boolean(payload.renotify),
      icon: "./icons/icon-192.png",
      badge: "./icons/badge-96.png",
      silent: Boolean(payload.silent),
      data: payload.data || {},
    });
    return true;
  }

  try {
    new Notification(payload.title, { body: payload.body, icon: "./icons/icon-192.png", tag: payload.tag });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- rest timer
/** Only worth interrupting for if the user has actually looked away. */
function notifyRestFinished() {
  const settings = nRead();
  if (!settings.rest || !notifyGranted()) return false;
  if (document.visibilityState === "visible") return false;
  showNotification({
    title: "Rest over",
    body: "Next set — let's go.",
    tag: "rest-timer",
    renotify: true,
    data: { url: "./index.html" },
  });
  return true;
}

// ---------------------------------------------------------------- workout reminder
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Split "HH:MM", falling back to the configured default — never to a literal,
 * or changing DEFAULT_NOTIFY.time would move only some of the behaviour.
 *
 * The shape is matched rather than coerced: Number("") is 0, not NaN, so a
 * value like "::" would otherwise pass a isFinite check and quietly set the
 * reminder to midnight.
 */
const parseHm = (time) => {
  const [dh, dm] = DEFAULT_NOTIFY.time.split(":").map(Number);
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!match) return { h: dh, m: dm };

  const h = Number(match[1]);
  const m = Number(match[2]);
  return h <= 23 && m <= 59 ? { h, m } : { h: dh, m: dm };
};

/**
 * Milliseconds until the reminder that sits `offset` minutes before the gym
 * time; negative once that moment has passed.
 */
function msUntilOffset(offset = 0, now = new Date(), time = nRead().time) {
  const { h, m } = parseHm(time);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  at.setMinutes(at.getMinutes() - Number(offset || 0));
  return at.getTime() - now.getTime();
}

/** The gym time itself. */
const msUntilReminder = (now = new Date(), time = nRead().time) => msUntilOffset(0, now, time);

const firedToday = (settings, offset) => settings.fired?.[String(offset)] === todayKey();

/**
 * Whether a given lead time is owed right now: reminders on, today is a
 * training day, that lead time has passed, today's session isn't done, and
 * this particular lead time hasn't already nudged today.
 */
function reminderDue({ now = new Date(), settings = nRead(), offset = 0, scheduledToday, doneToday } = {}) {
  if (!settings.workout) return false;
  if (!scheduledToday) return false;
  if (doneToday) return false;
  if (firedToday(settings, offset)) return false;
  return msUntilOffset(offset, now, settings.time) <= 0;
}

let reminderTimers = [];
const clearReminderTimers = () => {
  reminderTimers.forEach(clearTimeout);
  reminderTimers = [];
};

/** "Gym in 30 min" reads better than repeating the session title every time. */
function reminderCopy(offset, title, body) {
  if (Number(offset) === 0) return { title: title || "Time to train", body: body || "Your session is waiting." };
  return {
    title: `Gym in ${offsetLabel(offset).toLowerCase()}`,
    body: title || "Your session is coming up.",
  };
}

/**
 * Arms one timer per chosen lead time while the app is open, and handles any
 * that have already gone by. Called on load, when the tab becomes visible, and
 * whenever the schedule or settings change.
 */
function scheduleWorkoutReminder({ scheduledToday, doneToday, title, body, stats }) {
  clearReminderTimers();

  const settings = nRead();
  syncReminderPlan({ scheduledToday, doneToday, title, body, stats });
  updateAppBadge({ scheduledToday, doneToday });
  if (!settings.workout || !notifyGranted() || !scheduledToday || doneToday) return;

  for (const offset of settings.offsets) {
    if (firedToday(settings, offset)) continue;

    const wait = msUntilOffset(offset, new Date(), settings.time);

    if (wait <= 0) {
      // Already gone by. Buzzing someone who is looking at the app is
      // pointless — the screen in front of them already says what's due — so
      // this stays silent while visible, and isn't marked as fired either.
      // That leaves the closed-app path free to nudge later.
      if (document.visibilityState !== "visible") fireWorkoutReminder(title, body, offset);
      continue;
    }

    // setTimeout saturates past ~24.8 days; a same-day wait is always safe.
    reminderTimers.push(
      setTimeout(() => {
        // Same rule when the timer lands: if they're in the app at that
        // moment, count it as served rather than interrupting them.
        if (document.visibilityState === "visible") {
          markFired(offset);
          return;
        }
        fireWorkoutReminder(title, body, offset);
      }, wait)
    );
  }
}

const markFired = (offset) => nWrite({ fired: { ...nRead().fired, [String(offset)]: todayKey() } });

function fireWorkoutReminder(title, body, offset = 0) {
  if (!notifyGranted()) return;
  const copy = reminderCopy(offset, title, body);
  showNotification({
    ...copy,
    // A distinct tag per lead time, or the 30-minute nudge would silently
    // replace itself instead of the start-time one arriving alongside it.
    tag: `workout-reminder-${offset}`,
    data: { url: "./index.html" },
  });
  markFired(offset);
  syncReminderPlan({ scheduledToday: true, doneToday: false, title, body });
}

/**
 * Mirror the reminder into Cache Storage. A service worker woken by periodic
 * sync has no access to localStorage, so this is the only way it can know
 * whether a nudge is owed while every tab is closed.
 */
async function syncReminderPlan({ scheduledToday, doneToday, title, body, stats } = {}) {
  if (!("caches" in window)) return;
  const settings = nRead();
  try {
    const cache = await caches.open(PLAN_CACHE);
    await cache.put(
      PLAN_URL,
      new Response(
        JSON.stringify({
          enabled: Boolean(settings.workout) && notifyGranted(),
          time: settings.time,
          offsets: settings.offsets,
          fired: settings.fired,
          days: typeof trainingDays === "function" ? trainingDays() : [],
          doneOn: doneToday ? todayKey() : null,
          scheduledToday: scheduledToday ?? null,
          title: title || "Time to train",
          body: body || "Your session is waiting.",
          // Read by the Windows widget, which can't reach localStorage either.
          weekDone: stats?.weekDone ?? 0,
          weekTarget: stats?.weekTarget ?? 0,
          streak: stats?.streak ?? 0,
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
  } catch {
    /* storage pressure — the in-page timer still covers an open app */
  }
}

// ---------------------------------------------------------------- badge
/**
 * A count on the installed app's icon. This is the only thing a web app can
 * put on a phone's home screen beyond the icon itself — real home-screen
 * widgets need a native app on both Android and iOS.
 */
function updateAppBadge({ scheduledToday, doneToday }) {
  if (!("setAppBadge" in navigator)) return;
  try {
    if (scheduledToday && !doneToday) navigator.setAppBadge(1);
    else navigator.clearAppBadge();
  } catch {
    /* unsupported or not installed — the badge is a bonus, never load-bearing */
  }
}

/** Ask for a periodic wake-up. Chrome-only, and it may simply decline. */
async function requestPeriodicSync() {
  try {
    const reg = swRegistration || (await navigator.serviceWorker?.ready);
    if (!reg?.periodicSync) return false;
    const status = await navigator.permissions?.query({ name: "periodic-background-sync" });
    if (status && status.state !== "granted") return false;
    await reg.periodicSync.register("workout-reminder", { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- install
let installPrompt = null;

/** Captures the install prompt so it can be offered from Profile instead. */
function watchInstallPrompt(onChange) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    onChange?.();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    onChange?.();
  });
}

const canInstall = () => Boolean(installPrompt);

async function promptInstall() {
  if (!installPrompt) return "unavailable";
  const prompt = installPrompt;
  installPrompt = null; // a prompt event can only be used once
  try {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome;
  } catch {
    return "dismissed";
  }
}
