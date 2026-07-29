// FitFour — vanilla JS app shell. No build step, no dependencies.

const K_SESSIONS = "fitfour.sessions";
const K_WEIGHTS = "fitfour.weights";
const K_TICKS = "fitfour.ticks";
const K_THEME = "fitfour.theme";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Position within a Monday-first week, so sorting matches the UI. */
const weekOrder = (dow) => (dow === 0 ? 6 : dow - 1);

/** The user's chosen gym days, de-duped and ordered Monday-first. */
function trainingDays() {
  const raw = getProfile().trainingDays;
  const days = Array.isArray(raw) && raw.length ? raw : DEFAULT_TRAINING_DAYS;
  return [...new Set(days)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => weekOrder(a) - weekOrder(b));
}

/**
 * Weekday → workout id. The four workouts are dealt out in order across
 * whichever days the user picked, cycling if they train more than four days.
 */
function schedule() {
  const map = {};
  trainingDays().forEach((dow, i) => {
    map[dow] = WORKOUTS[i % WORKOUTS.length].id;
  });
  return map;
}

/** How many distinct workouts a full week should contain. */
const weeklyTarget = () => new Set(Object.values(schedule())).size || WORKOUTS.length;

/** The next scheduled session after today, for the rest-day screen. */
function nextSession() {
  const sched = schedule();
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const id = sched[d.getDay()];
    if (id) return { date: d, day: WORKOUTS.find((w) => w.id === id) };
  }
  return null;
}

let route = { tab: "today", dayId: null };

// Direction of the next screen transition: "fade" between tabs, "push" when
// drilling into a workout, "pop" when coming back out.
let nav = "fade";

// ---------------------------------------------------------------- storage
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const write = (key, val) => localStorage.setItem(key, JSON.stringify(val));

const getSessions = () => read(K_SESSIONS, []);
const getWeights = () => read(K_WEIGHTS, []);
const getTicks = () => read(K_TICKS, {});

const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day)); // Monday
  return d;
}

const sessionsThisWeek = () => {
  const from = startOfWeek();
  return getSessions().filter((s) => new Date(s.date) >= from);
};
const didDayThisWeek = (dayId) => sessionsThisWeek().some((s) => s.dayId === dayId);
const didDayOn = (dayId, key) =>
  getSessions().some((s) => s.dayId === dayId && dateKey(new Date(s.date)) === key);

function toggleSession(dayId) {
  const day = WORKOUTS.find((d) => d.id === dayId);
  const today = dateKey();
  const sessions = getSessions();
  const i = sessions.findIndex((s) => s.dayId === dayId && dateKey(new Date(s.date)) === today);
  if (i >= 0) sessions.splice(i, 1);
  else sessions.push({ date: new Date().toISOString(), dayId, title: day.title });
  write(K_SESSIONS, sessions);
}

const tickKey = (dayId) => `${dateKey()}|${dayId}`;
const getDayTicks = (dayId) => getTicks()[tickKey(dayId)] || [];

function toggleTick(dayId, index) {
  const all = getTicks();
  const key = tickKey(dayId);
  const list = new Set(all[key] || []);
  list.has(index) ? list.delete(index) : list.add(index);
  all[key] = [...list];
  write(K_TICKS, all);
  return all[key];
}

/** Current consecutive-week streak of hitting every scheduled session. */
function weeklyStreak() {
  const sessions = getSessions();
  if (!sessions.length) return 0;
  const target = weeklyTarget();
  let streak = 0;
  for (let back = 0; back < 52; back++) {
    const from = startOfWeek();
    from.setDate(from.getDate() - back * 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    const ids = new Set(
      sessions
        .filter((s) => new Date(s.date) >= from && new Date(s.date) < to)
        .map((s) => s.dayId)
    );
    if (ids.size >= target) streak++;
    else if (back > 0) break;
    else if (ids.size === 0) break;
  }
  return streak;
}

// ---------------------------------------------------------------- theme
function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function activeTheme() {
  return read(K_THEME, null) || systemTheme();
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.getElementById("themeColorMeta");
  if (meta) meta.setAttribute("content", theme === "light" ? "#F4F4F8" : "#08080C");
}
function toggleTheme() {
  const next = activeTheme() === "light" ? "dark" : "light";
  write(K_THEME, next);
  applyTheme(next);
  render();
}

// ---------------------------------------------------------------- helpers
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const todaysDayId = () => schedule()[new Date().getDay()] || null;

function relDate(iso) {
  const d = new Date(iso);
  const today = dateKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateKey(d) === today) return "Today";
  if (dateKey(d) === dateKey(y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------- app bar
function renderAppbar() {
  const bar = document.getElementById("appbar");
  const themeIcon = activeTheme() === "light" ? "moon" : "sun";
  const inDay = Boolean(route.dayId);
  const titles = { today: "Today", plan: "Your Plan", progress: "Progress", profile: "Profile" };
  const title = inDay
    ? WORKOUTS.find((d) => d.id === route.dayId)?.title
    : titles[route.tab];

  const p = getProfile();
  const avatarInner = p.avatar
    ? `<img src="${p.avatar}" alt="" />`
    : profileComplete(p)
      ? esc(initials(p.name))
      : icon("user", 17);

  // The avatar shortcut belongs on the home screen only — it would be
  // redundant on Profile and noise everywhere else.
  const showAvatar = !inDay && route.tab === "today";

  bar.className = "appbar" + (inDay ? " always-title" : "");
  bar.innerHTML = `
    ${inDay
      ? `<button class="icon-btn" id="backBtn" aria-label="Back">${icon("back")}</button>`
      : showAvatar
        ? `<button class="appbar-avatar" id="appbarAvatar" aria-label="Open your profile">${avatarInner}</button>`
        : `<span class="appbar-spacer"></span>`}
    <div class="appbar-title">${esc(title || "")}</div>
    <button class="icon-btn" id="themeBtn" aria-label="Switch to ${activeTheme() === "light" ? "dark" : "light"} mode">${icon(themeIcon, 21)}</button>
  `;

  bar.querySelector("#backBtn")?.addEventListener("click", () => {
    nav = "pop";
    route = { ...route, dayId: null };
    render();
  });
  bar.querySelector("#appbarAvatar")?.addEventListener("click", () => {
    if (route.tab === "profile") return;
    nav = "fade";
    route = { tab: "profile", dayId: null };
    window.scrollTo(0, 0);
    render();
  });
  bar.querySelector("#themeBtn").addEventListener("click", toggleTheme);
}

// ---------------------------------------------------------------- tab bar
const TABS = [
  { id: "today", label: "Today", icon: "flame" },
  { id: "plan", label: "Plan", icon: "dumbbell" },
  { id: "progress", label: "Progress", icon: "chart" },
  { id: "profile", label: "Profile", icon: "user" },
];

/**
 * Built once rather than re-rendered, so the sliding indicator and the
 * icon pop animation have stable elements to transition between.
 */
function buildTabbar() {
  const el = document.getElementById("tabbar");
  if (el.dataset.built) return;
  el.dataset.built = "1";

  el.innerHTML =
    `<span class="tab-pill" aria-hidden="true"></span>` +
    TABS.map(
      (t) => `
      <button class="tab" data-tab="${t.id}">
        <span class="tab-ico">${icon(t.icon, 23)}</span>
        <span class="tab-lab">${t.label}</span>
      </button>`
    ).join("");

  el.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (route.tab === btn.dataset.tab && !route.dayId) return;
      nav = "fade";
      route = { tab: btn.dataset.tab, dayId: null };
      window.scrollTo(0, 0);
      render();
    })
  );
}

function updateTabbar() {
  const el = document.getElementById("tabbar");
  const index = TABS.findIndex((t) => t.id === route.tab);

  el.querySelector(".tab-pill").style.transform = `translateX(${index * 100}%)`;
  el.querySelectorAll(".tab").forEach((btn, i) =>
    btn.classList.toggle("active", i === index)
  );
}

// ---------------------------------------------------------------- screens
function screenToday() {
  const p = getProfile();
  const dayId = todaysDayId();
  const day = dayId ? WORKOUTS.find((d) => d.id === dayId) : null;
  const done = day ? didDayOn(day.id, dateKey()) : false;
  const week = sessionsThisWeek();
  const targets = nutritionTargets(p);
  const firstName = (p.name || "").trim().split(/\s+/)[0];

  const sched = schedule();
  const weekStart = startOfWeek();
  const dots = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    const scheduled = sched[d.getDay()];
    const isDone = getSessions().some((s) => dateKey(new Date(s.date)) === key);
    const isToday = key === dateKey();
    const cls = isDone ? "done" : scheduled ? "planned" : "";
    return `
      <div class="week-day">
        <span>${DOW[d.getDay()]}</span>
        <div class="week-dot ${cls}${isToday && !isDone ? " today" : ""}">
          ${isDone ? icon("check", 16) : scheduled ? `<span style="font-size:10px;font-weight:700">${WORKOUTS.findIndex((w) => w.id === scheduled) + 1}</span>` : ""}
        </div>
      </div>`;
  }).join("");

  return `
    <h1 class="large-title">${firstName ? `Hey, ${esc(firstName)}` : "Today"}</h1>
    <p class="subtitle">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>

    ${day
      ? `<div class="hero">
          <div class="hero-eyebrow">${done ? "Completed" : "Today's session"}</div>
          <h2>${esc(day.title)}</h2>
          <p>${esc(day.focus)} · ${day.exercises.length} exercises</p>
          <button class="hero-cta" data-open-day="${day.id}">
            ${done ? "Review workout" : "Start workout"}
          </button>
        </div>`
      : (() => {
          const next = nextSession();
          const when = next
            ? next.date.getDate() === new Date().getDate() + 1
              ? "Tomorrow"
              : DOW_FULL[next.date.getDay()]
            : null;
          return `<div class="hero rest">
            <div class="hero-eyebrow">Rest day</div>
            <h2>Recovery matters</h2>
            <p>${next
              ? `Muscle is built while you rest. Next up — <strong>${when}: ${esc(next.day.title)}</strong>.`
              : "Muscle is built while you rest. Pick your training days to get started."}</p>
            <button class="hero-cta" data-tab-go="${next ? "plan" : "profile"}">
              ${next ? "Browse the plan" : "Choose training days"}
            </button>
          </div>`;
        })()}

    <div class="stats">
      <div class="stat"><div class="stat-val tnum">${week.length}<span style="color:var(--text-3);font-size:14px">/${weeklyTarget()}</span></div><div class="stat-lab">This week</div></div>
      <div class="stat"><div class="stat-val tnum">${getSessions().length}</div><div class="stat-lab">Total</div></div>
      <div class="stat"><div class="stat-val tnum">${weeklyStreak()}</div><div class="stat-lab">Week streak</div></div>
    </div>

    <div class="section-head"><h3>Your week</h3></div>
    <div class="card"><div class="week">${dots}</div></div>

    ${targets
      ? `<div class="section-head"><h3>Daily targets</h3><a class="link" data-tab-go="profile">Adjust</a></div>
         <div class="card" style="overflow:hidden">
           <div class="macros">
             <div class="macro"><div class="macro-val tnum">${targets.calories}</div><div class="macro-lab">kcal</div></div>
             <div class="macro"><div class="macro-val tnum">${targets.protein}g</div><div class="macro-lab">Protein</div></div>
             <div class="macro"><div class="macro-val tnum">${targets.carbs}g</div><div class="macro-lab">Carbs</div></div>
           </div>
         </div>
         <div class="note">${icon("info", 17)}<div>A <strong>${targets.maintenance - targets.calories} kcal</strong> daily deficit off your ~${targets.maintenance} kcal maintenance — enough to lose fat steadily while protein protects your muscle.</div></div>`
      : `<div class="section-head"><h3>Get set up</h3></div>
         <button class="card row" data-tab-go="profile" style="width:100%">
           <div class="row-badge" style="background:var(--grad-brand)">${icon("target", 20)}</div>
           <div class="row-body">
             <div class="row-title">Complete your profile</div>
             <div class="row-sub">Get personalised calorie and protein targets</div>
           </div>
           ${icon("chevron", 18)}
         </button>`}
  `;
}

function screenPlan() {
  return `
    <h1 class="large-title">Your Plan</h1>
    <p class="subtitle">4 days a week · upper/lower split</p>

    <div class="card rows">
      ${WORKOUTS.map((d) => {
        const done = didDayThisWeek(d.id);
        return `
          <button class="row" data-open-day="${d.id}">
            <div class="row-badge" style="background:${d.accent}" title="${esc(d.short)}">${icon(d.iconName, 23)}</div>
            <div class="row-body">
              <div class="row-title">${esc(d.title)}</div>
              <div class="row-sub">${esc(d.focus)} · ${d.exercises.length} exercises</div>
            </div>
            ${done
              ? `<div class="week-dot done" style="width:24px;height:24px">${icon("check", 14)}</div>`
              : `<span class="chev">${icon("chevron", 18)}</span>`}
          </button>`;
      }).join("")}
    </div>

    <div class="section-head"><h3>Guides</h3></div>
    <div class="card rows">
      <button class="row" data-open-nutrition>
        <div class="row-badge" style="background:linear-gradient(135deg,#FFB020,#FF6B4D)">${icon("fire", 20)}</div>
        <div class="row-body">
          <div class="row-title">Nutrition basics</div>
          <div class="row-sub">Eat to lose fat without losing muscle</div>
        </div>
        <span class="chev">${icon("chevron", 18)}</span>
      </button>
    </div>

    <div class="section-head"><h3>Schedule</h3></div>
    <div class="card rows">
      <button class="row" data-open-schedule>
        <div class="row-badge" style="background:linear-gradient(135deg,#2E9BFF,#00D49A)">${icon("timer", 20)}</div>
        <div class="row-body">
          <div class="row-title">Training days</div>
          <div class="row-sub">${trainingDays().map((d) => DOW_SHORT[d]).join(" · ")}</div>
        </div>
        <span class="chev">${icon("chevron", 18)}</span>
      </button>
    </div>

    <div class="note" style="margin-top:12px">
      ${icon("info", 17)}
      <div>Leave a rest day between heavy sessions where you can — but consistency beats the perfect calendar. Train the days you'll actually show up.</div>
    </div>
  `;
}

function screenDay(dayId) {
  const day = WORKOUTS.find((d) => d.id === dayId);
  const ticks = getDayTicks(dayId);
  const done = didDayOn(dayId, dateKey());
  const pct = Math.round((ticks.length / day.exercises.length) * 100);

  return `
    <div class="day-hero">
      <h2>${esc(day.title)}</h2>
      <div class="focus">${esc(day.focus)}</div>
      <div class="progress-wrap">
        <div class="progress-meta">
          <span id="progLabel">${ticks.length} of ${day.exercises.length} done</span>
          <span class="tnum" id="progPct">${pct}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" id="progFill" style="width:${pct}%"></div></div>
      </div>
    </div>

    <div class="note">${icon("timer", 17)}<div><strong>Warm-up:</strong> ${esc(day.warmup)}</div></div>

    ${day.exercises.map((ex, i) => {
      const isDone = ticks.includes(i);
      return `
        <div class="ex${isDone ? " done" : ""}" data-ex="${i}">
          <div class="ex-top">
            <button class="ex-thumb" data-play="${i}" aria-label="Watch form video for ${esc(ex.name)}">
              <img src="https://img.youtube.com/vi/${ex.videoId}/mqdefault.jpg" alt="" loading="lazy" />
              <span class="play-badge">${icon("play", 15)}</span>
            </button>
            <div class="ex-info">
              <div class="ex-name">${esc(ex.name)}</div>
              <div class="chips">
                <span class="chip primary">${ex.sets} × ${ex.reps}</span>
                <span class="chip tappable" data-rest="${parseInt(ex.rest, 10) || 60}">${icon("timer", 13)} ${ex.rest}</span>
              </div>
            </div>
            <button class="tick" data-tick="${i}" aria-label="Mark ${esc(ex.name)} done">${icon("check", 17)}</button>
          </div>
          <p class="cue">${esc(ex.cue)}</p>
        </div>`;
    }).join("")}

    <div class="note" style="margin-top:14px">${icon("fire", 17)}<div><strong>Finisher:</strong> ${esc(day.cardioFinisher)}</div></div>

    <div class="btn-row">
      <button class="btn ${done ? "success" : ""}" id="finishBtn">
        ${done ? "✓ Completed today" : "Finish workout"}
      </button>
    </div>
  `;
}

function screenProgress() {
  const p = getProfile();
  const unit = weightUnit(p);
  const weights = [...getWeights()].sort((a, b) => new Date(a.date) - new Date(b.date));
  const desc = [...weights].reverse();
  const sessions = [...getSessions()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);

  const latest = desc[0]?.kg;
  const first = weights[0]?.kg;
  const change = latest != null && first != null ? latest - first : null;

  return `
    <h1 class="large-title">Progress</h1>
    <p class="subtitle">Weigh in weekly — same time, same conditions</p>

    <div class="card card-pad">
      <button class="btn" id="logWeightBtn">${icon("plus", 19)}<span>Log weight</span></button>
    </div>

    ${weights.length
      ? `<div class="section-head">
           <h3>Body weight</h3>
           ${change != null
             ? `<span class="delta ${change < -0.05 ? "down" : change > 0.05 ? "up" : "flat"}">
                  ${change > 0 ? "+" : ""}${displayWeight(change, p)} ${unit} overall
                </span>`
             : ""}
         </div>
         <div class="card chart-card">${weightChart(weights)}</div>
         <div class="card rows" style="margin-top:12px">
           ${desc.slice(0, 8).map((w, i) => {
             const prev = desc[i + 1];
             const d = prev ? w.kg - prev.kg : null;
             const cls = d == null ? "flat" : d < -0.05 ? "down" : d > 0.05 ? "up" : "flat";
             return `
               <div class="log-row">
                 <span class="log-date">${relDate(w.date)}</span>
                 <span class="log-val tnum">${displayWeight(w.kg, p)} ${unit}</span>
                 <span class="delta ${cls} tnum">${d == null ? "—" : `${d > 0 ? "+" : ""}${displayWeight(d, p)}`}</span>
               </div>`;
           }).join("")}
         </div>`
      : `<div class="card" style="margin-top:12px"><div class="empty">${icon("scale", 34)}Log your weight to see your trend line here.</div></div>`}

    <div class="section-head"><h3>Recent sessions</h3></div>
    <div class="card rows">
      ${sessions.length
        ? sessions.map((s) => {
            const day = WORKOUTS.find((d) => d.id === s.dayId);
            return `
              <div class="log-row">
                <div class="row-badge" style="background:${day?.accent || "var(--brand)"};width:34px;height:34px;border-radius:11px" title="${esc(day?.short || "")}">${day ? icon(day.iconName, 19) : "—"}</div>
                <span class="log-date">${esc(day?.title || s.title)}</span>
                <span class="log-val" style="color:var(--text-2);font-weight:550">${relDate(s.date)}</span>
              </div>`;
          }).join("")
        : `<div class="empty">${icon("dumbbell", 34)}No sessions yet. Finish a workout to start your history.</div>`}
    </div>
  `;
}

/** Area + line chart of body weight over time. */
function weightChart(weights) {
  const w = 320, h = 130, padX = 6, padY = 16;
  const vals = weights.map((x) => x.kg);

  if (vals.length === 1) {
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <line x1="${padX}" y1="${h / 2}" x2="${w - padX}" y2="${h / 2}"
            stroke="var(--border-2)" stroke-width="2" stroke-dasharray="5 6" />
      <circle cx="${w / 2}" cy="${h / 2}" r="5" fill="var(--brand)" />
    </svg>`;
  }

  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => [
    padX + (i / (vals.length - 1)) * (w - padX * 2),
    h - padY - ((v - min) / range) * (h - padY * 2),
  ]);

  const line = pts.map(([x, y], i) => (i ? `L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`)).join(" ");
  const area = `${line} L${pts.at(-1)[0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;

  return `
    <svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#fillGrad)" />
      <path d="${line}" fill="none" stroke="var(--brand)" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      ${pts.map(([x, y], i) =>
        i === pts.length - 1
          ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="var(--brand)" stroke="var(--surface)" stroke-width="2.5" />`
          : ""
      ).join("")}
    </svg>`;
}

function screenProfile() {
  const p = getProfile();
  const unit = weightUnit(p);
  const t = nutritionTargets(p);
  const b = bmi(p);
  const complete = profileComplete(p);

  return `
    <div class="profile-head">
      <button class="avatar-btn" id="avatarBtn" aria-label="${p.avatar ? "Change or remove your profile photo" : "Add a profile photo"}">
        <span class="avatar">
          ${p.avatar
            ? `<img src="${p.avatar}" alt="" />`
            : complete
              ? esc(initials(p.name))
              : icon("user", 34)}
        </span>
        <span class="avatar-edit">${icon("camera", 15)}</span>
      </button>
      <input type="file" id="avatarInput" accept="image/*" hidden />
      <p class="avatar-error" id="avatarError" hidden></p>
      <div class="profile-name">${complete ? esc(p.name) : "Set up your profile"}</div>
      <div class="profile-meta">
        ${complete
          ? `${p.age} yrs old· ${formatHeight(p.heightCm, p)} · ${displayWeight(p.weightKg, p)} ${unit}`
          : "Add your details for personalised targets"}
      </div>
    </div>

    <div class="btn-row"><button class="btn" id="editProfileBtn">${complete ? "Edit profile" : "Get started"}</button></div>

    ${t
      ? `<div class="section-head"><h3>Daily targets</h3></div>
         <div class="card" style="overflow:hidden">
           <div class="macros">
             <div class="macro"><div class="macro-val tnum">${t.calories}</div><div class="macro-lab">kcal</div></div>
             <div class="macro"><div class="macro-val tnum">${t.protein}g</div><div class="macro-lab">Protein</div></div>
             <div class="macro"><div class="macro-val tnum">${t.fat}g</div><div class="macro-lab">Fat</div></div>
           </div>
           <div class="kv" style="border-top:1px solid var(--border)">
             <span class="kv-label">Maintenance</span><span class="kv-val tnum">${t.maintenance} kcal</span>
           </div>
           ${b ? `<div class="kv"><span class="kv-label">BMI</span><span class="kv-val tnum">${b}</span></div>` : ""}
           ${p.goalWeightKg
             ? `<div class="kv"><span class="kv-label">Goal weight</span><span class="kv-val tnum">${displayWeight(p.goalWeightKg, p)} ${unit}</span></div>`
             : ""}
         </div>`
      : ""}

    <div class="section-head"><h3>Schedule</h3></div>
    <div class="card rows">
      <button class="row" data-open-schedule>
        <div class="row-body">
          <div class="row-title">Training days</div>
          <div class="row-sub">${trainingDays().map((d) => DOW_SHORT[d]).join(" · ")} · ${weeklyTarget()} workouts a week</div>
        </div>
        <span class="chev">${icon("chevron", 18)}</span>
      </button>
    </div>

    <div class="section-head"><h3>Preferences</h3></div>
    <div class="card">
      <div class="kv">
        <span class="kv-label">Units</span>
        <div class="seg" id="unitSeg">
          <button data-units="metric" class="${p.units === "metric" ? "on" : ""}">kg · cm</button>
          <button data-units="imperial" class="${p.units === "imperial" ? "on" : ""}">lb · ft</button>
        </div>
      </div>
      <div class="kv">
        <span class="kv-label">Appearance</span>
        <div class="seg" id="themeSeg">
          <button data-theme-set="light" class="${activeTheme() === "light" ? "on" : ""}">Light</button>
          <button data-theme-set="dark" class="${activeTheme() === "dark" ? "on" : ""}">Dark</button>
        </div>
      </div>
    </div>

    <div class="section-head"><h3>Data</h3></div>
    <div class="card rows">
      <button class="row" data-open-nutrition>
        <div class="row-body"><div class="row-title">Nutrition basics</div><div class="row-sub">The rules that actually matter</div></div>
        <span class="chev">${icon("chevron", 18)}</span>
      </button>
      <button class="row" id="exportBtn">
        <div class="row-body"><div class="row-title">Export my data</div><div class="row-sub">Download everything as JSON</div></div>
        <span class="chev">${icon("chevron", 18)}</span>
      </button>
    </div>

    <div class="btn-row"><button class="btn danger" id="resetBtn">${icon("trash", 18)}<span>Reset all data</span></button></div>

    <p style="text-align:center;color:var(--text-3);font-size:12px;margin-top:18px;line-height:1.6">
      Everything is stored only on this device.<br />Warm up first and stop if you feel sharp pain.
    </p>
  `;
}

// ---------------------------------------------------------------- sheets
function openSheet(html, onMount) {
  const wrap = document.getElementById("sheetWrap");
  const sheet = document.getElementById("sheet");
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  wrap.hidden = false;
  document.body.style.overflow = "hidden";
  onMount?.(sheet);
}

function closeSheet() {
  document.getElementById("sheetWrap").hidden = true;
  document.body.style.overflow = "";
}

function openProfileSheet() {
  const p = getProfile();
  const unit = weightUnit(p);
  const h = displayHeight(p.heightCm, p);

  openSheet(
    `
    <h3>Your details</h3>
    <p class="sheet-sub">Used to calculate your calorie and protein targets. Stays on this device.</p>

    <div class="field">
      <label for="fName">Name</label>
      <input class="input" id="fName" type="text" autocomplete="name" placeholder="Your name" value="${esc(p.name || "")}" />
    </div>

    <div class="field-row">
      <div class="field">
        <label for="fAge">Age</label>
        <input class="input" id="fAge" type="number" inputmode="numeric" min="13" max="100" placeholder="25" value="${p.age ?? ""}" />
      </div>
      <div class="field">
        <label for="fWeight">Weight (${unit})</label>
        <input class="input" id="fWeight" type="number" inputmode="decimal" step="0.1" placeholder="${p.units === "imperial" ? "170" : "77"}" value="${p.weightKg != null ? displayWeight(p.weightKg, p) : ""}" />
      </div>
    </div>

    <div class="field">
      <label>Height</label>
      ${p.units === "imperial"
        ? `<div class="field-row">
             <input class="input" id="fFeet" type="number" inputmode="numeric" min="3" max="8" placeholder="ft" value="${h?.feet ?? ""}" />
             <input class="input" id="fInches" type="number" inputmode="numeric" min="0" max="11" placeholder="in" value="${h?.inches ?? ""}" />
           </div>`
        : `<input class="input" id="fCm" type="number" inputmode="numeric" min="120" max="230" placeholder="175" value="${h?.cm ?? ""}" />`}
    </div>

    <div class="field">
      <label for="fGoal">Goal weight (${unit}) <span style="color:var(--text-3);font-weight:500">— optional</span></label>
      <input class="input" id="fGoal" type="number" inputmode="decimal" step="0.1" placeholder="Target" value="${p.goalWeightKg != null ? displayWeight(p.goalWeightKg, p) : ""}" />
    </div>

    <div class="field">
      <label> Gender <span style="color:var(--text-3);font-weight:500">— affects the calorie formula</span></label>
      <div class="choice" id="sexChoice">
        <button data-sex="female" class="${p.sex === "female" ? "on" : ""}">Female</button>
        <button data-sex="male" class="${p.sex === "male" ? "on" : ""}">Male</button>
      </div>
    </div>

    <div class="btn-row"><button class="btn" id="saveProfileBtn">Save</button></div>
    <div style="margin-top:10px"><button class="btn secondary" data-sheet-close>Cancel</button></div>
    `,
    (sheet) => {
      let sex = p.sex;
      sheet.querySelectorAll("[data-sex]").forEach((b) =>
        b.addEventListener("click", () => {
          sex = b.dataset.sex;
          sheet.querySelectorAll("[data-sex]").forEach((x) => x.classList.toggle("on", x === b));
        })
      );

      sheet.querySelector("#saveProfileBtn").addEventListener("click", () => {
        const cur = getProfile();
        const num = (id) => {
          const v = parseFloat(sheet.querySelector(id)?.value);
          return isFinite(v) ? v : null;
        };

        let heightCm = null;
        if (cur.units === "imperial") {
          const ft = num("#fFeet"), inch = num("#fInches") ?? 0;
          if (ft) heightCm = inToCm(ft * 12 + inch);
        } else {
          heightCm = num("#fCm");
        }

        saveProfile({
          name: sheet.querySelector("#fName").value.trim(),
          age: num("#fAge"),
          weightKg: inputWeightToKg(sheet.querySelector("#fWeight").value, cur),
          goalWeightKg: inputWeightToKg(sheet.querySelector("#fGoal").value, cur),
          heightCm,
          sex,
        });

        closeSheet();
        render();
      });
    }
  );
}

function openWeightSheet() {
  const p = getProfile();
  const unit = weightUnit(p);

  openSheet(
    `
    <h3>Log weight</h3>
    <p class="sheet-sub">Weigh in first thing in the morning for the most consistent readings.</p>
    <div class="field">
      <label for="wInput">Weight (${unit})</label>
      <input class="input" id="wInput" type="number" inputmode="decimal" step="0.1"
             placeholder="${p.weightKg != null ? displayWeight(p.weightKg, p) : unit === "kg" ? "77.0" : "170.0"}" />
    </div>
    <div class="btn-row"><button class="btn" id="saveWeightBtn">Save entry</button></div>
    <div style="margin-top:10px"><button class="btn secondary" data-sheet-close>Cancel</button></div>
    `,
    (sheet) => {
      const input = sheet.querySelector("#wInput");
      setTimeout(() => input.focus(), 120);

      const save = () => {
        const kg = inputWeightToKg(input.value, getProfile());
        if (kg == null) return;
        const list = getWeights();
        list.push({ date: new Date().toISOString(), kg });
        write(K_WEIGHTS, list);
        saveProfile({ weightKg: kg }); // keep targets in sync with latest weigh-in
        closeSheet();
        render();
      };

      sheet.querySelector("#saveWeightBtn").addEventListener("click", save);
      input.addEventListener("keydown", (e) => e.key === "Enter" && save());
    }
  );
}

function openScheduleSheet() {
  const picked = new Set(trainingDays());

  // Order the toggles Monday-first to match the rest of the app.
  const order = [1, 2, 3, 4, 5, 6, 0];

  const preview = () => {
    const days = [...picked].sort((a, b) => weekOrder(a) - weekOrder(b));
    if (!days.length) {
      return `<p class="empty" style="padding:18px 0">Pick at least one day to build your week.</p>`;
    }
    return days
      .map((dow, i) => {
        const w = WORKOUTS[i % WORKOUTS.length];
        return `
          <div class="assign-row">
            <span class="assign-day">${DOW_SHORT[dow]}</span>
            <span class="assign-badge" style="background:${w.accent}" title="${esc(w.short)}">${icon(w.iconName, 18)}</span>
            <span class="assign-name">${esc(w.title)}</span>
          </div>`;
      })
      .join("");
  };

  openSheet(
    `
    <h3>Training days</h3>
    <p class="sheet-sub">Pick the days you'll actually be in the gym — weekends included. The four workouts are dealt out in order across whatever you choose.</p>

    <div class="day-picker" id="dayPicker">
      ${order
        .map(
          (dow) => `
        <button class="day-toggle${picked.has(dow) ? " on" : ""}" data-dow="${dow}"
                aria-pressed="${picked.has(dow)}" aria-label="${DOW_FULL[dow]}">${DOW[dow]}</button>`
        )
        .join("")}
    </div>

    <div class="assign" id="assignPreview">${preview()}</div>

    <div class="btn-row"><button class="btn" id="saveSchedule">Save schedule</button></div>
    <div style="margin-top:10px"><button class="btn secondary" data-sheet-close>Cancel</button></div>
    `,
    (sheet) => {
      const previewEl = sheet.querySelector("#assignPreview");

      sheet.querySelectorAll("[data-dow]").forEach((btn) =>
        btn.addEventListener("click", () => {
          const dow = Number(btn.dataset.dow);
          picked.has(dow) ? picked.delete(dow) : picked.add(dow);
          btn.classList.toggle("on", picked.has(dow));
          btn.setAttribute("aria-pressed", String(picked.has(dow)));
          previewEl.innerHTML = preview();
          navigator.vibrate?.(8);
        })
      );

      sheet.querySelector("#saveSchedule").addEventListener("click", () => {
        if (!picked.size) return;
        saveProfile({ trainingDays: [...picked].sort((a, b) => weekOrder(a) - weekOrder(b)) });
        closeSheet();
        render();
      });
    }
  );
}

function openVideoSheet(dayId, index) {
  const ex = WORKOUTS.find((d) => d.id === dayId).exercises[index];
  openSheet(`
    <div class="player">
      <iframe src="https://www.youtube-nocookie.com/embed/${ex.videoId}?autoplay=1&rel=0&playsinline=1"
        title="How to perform ${esc(ex.name)}" frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
    </div>
    <h3>${esc(ex.name)}</h3>
    <p class="sheet-sub">${esc(ex.muscle)} · ${ex.sets} sets × ${ex.reps} · rest ${ex.rest}</p>
    <p style="font-size:14px;color:var(--text-2);line-height:1.55">${esc(ex.cue)}</p>
    <a class="yt-link" href="https://www.youtube.com/watch?v=${ex.videoId}" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
    <div class="btn-row"><button class="btn secondary" data-sheet-close>Done</button></div>
  `);
}

function openNutritionSheet() {
  openSheet(`
    <h3>Nutrition basics</h3>
    <p class="sheet-sub">Five rules that carry most of the result.</p>
    ${NUTRITION_TIPS.map(
      (t, i) => `
      <div style="display:flex;gap:13px;padding:14px 0;border-bottom:${i === NUTRITION_TIPS.length - 1 ? "none" : "1px solid var(--border)"}">
        <div class="row-badge" style="background:var(--grad-brand);width:30px;height:30px;border-radius:10px;font-size:12px">${i + 1}</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:650;letter-spacing:-0.015em">${esc(t.title)}</div>
          <p style="font-size:13.5px;color:var(--text-2);line-height:1.5;margin-top:4px">${esc(t.body)}</p>
        </div>
      </div>`
    ).join("")}
    <div class="btn-row"><button class="btn secondary" data-sheet-close>Done</button></div>
  `);
}

// ---------------------------------------------------------------- rest timer
let restInterval = null;

function startRest(seconds) {
  stopRest();
  const el = document.getElementById("restTimer");
  let left = seconds;

  const paint = () => {
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, "0");
    el.innerHTML = `
      ${icon("timer", 20)}
      <span class="rest-label">Rest</span>
      <span class="rest-count tnum">${m}:${s}</span>
      <button class="rest-x" id="restX" aria-label="Stop rest timer">${icon("close", 16)}</button>`;
    el.querySelector("#restX").addEventListener("click", stopRest);
  };

  el.hidden = false;
  paint();

  restInterval = setInterval(() => {
    left--;
    if (left <= 0) {
      stopRest();
      navigator.vibrate?.([120, 60, 120]);
      return;
    }
    paint();
  }, 1000);
}

function stopRest() {
  clearInterval(restInterval);
  restInterval = null;
  const el = document.getElementById("restTimer");
  el.hidden = true;
  el.innerHTML = "";
}

// ---------------------------------------------------------------- avatar
function bindAvatar(view) {
  const btn = view.querySelector("#avatarBtn");
  const input = view.querySelector("#avatarInput");
  const errorEl = view.querySelector("#avatarError");
  if (!btn || !input) return;

  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };

  const pickFile = () => {
    errorEl.hidden = true;
    input.click();
  };

  btn.addEventListener("click", () => {
    // With a photo already set, offer replace/remove rather than jumping
    // straight into the file picker.
    if (!getProfile().avatar) return pickFile();

    openSheet(
      `
      <h3>Profile photo</h3>
      <p class="sheet-sub">Your photo is stored on this device only.</p>
      <div class="btn-row"><button class="btn" id="avatarChange">${icon("image", 18)}<span>Choose a new photo</span></button></div>
      <div style="margin-top:10px"><button class="btn danger" id="avatarRemove">${icon("trash", 18)}<span>Remove photo</span></button></div>
      <div style="margin-top:10px"><button class="btn secondary" data-sheet-close>Cancel</button></div>
      `,
      (sheet) => {
        sheet.querySelector("#avatarChange").addEventListener("click", () => {
          closeSheet();
          pickFile();
        });
        sheet.querySelector("#avatarRemove").addEventListener("click", () => {
          clearAvatar();
          closeSheet();
          render();
        });
      }
    );
  });

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    btn.classList.add("busy");
    try {
      const dataUrl = await processAvatar(file);
      const result = saveAvatar(dataUrl);
      if (!result.ok) throw new Error(result.error);
      render();
    } catch (err) {
      btn.classList.remove("busy");
      showError(err.message || "That photo couldn't be saved.");
    } finally {
      input.value = ""; // let the same file be re-picked after an error
    }
  });
}

// ---------------------------------------------------------------- wiring
function bindScreen(view) {
  view.querySelectorAll("[data-open-day]").forEach((el) =>
    el.addEventListener("click", () => {
      nav = "push";
      route = { tab: route.tab, dayId: el.dataset.openDay };
      window.scrollTo(0, 0);
      render();
    })
  );

  view.querySelectorAll("[data-tab-go]").forEach((el) =>
    el.addEventListener("click", () => {
      nav = "fade";
      route = { tab: el.dataset.tabGo, dayId: null };
      window.scrollTo(0, 0);
      render();
    })
  );

  view.querySelectorAll("[data-open-nutrition]").forEach((el) =>
    el.addEventListener("click", openNutritionSheet)
  );

  view.querySelectorAll("[data-open-schedule]").forEach((el) =>
    el.addEventListener("click", openScheduleSheet)
  );

  // Videos load only when opened, so the day list stays light.
  view.querySelectorAll("[data-play]").forEach((el) =>
    el.addEventListener("click", () => openVideoSheet(route.dayId, Number(el.dataset.play)))
  );

  // Ticking an exercise patches the DOM in place so playing videos survive.
  view.querySelectorAll("[data-tick]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.tick);
      const day = WORKOUTS.find((d) => d.id === route.dayId);
      const ticks = toggleTick(route.dayId, i);

      btn.closest(".ex").classList.toggle("done", ticks.includes(i));
      const pct = Math.round((ticks.length / day.exercises.length) * 100);
      view.querySelector("#progFill").style.width = `${pct}%`;
      view.querySelector("#progPct").textContent = `${pct}%`;
      view.querySelector("#progLabel").textContent = `${ticks.length} of ${day.exercises.length} done`;
      navigator.vibrate?.(10);
    })
  );

  view.querySelectorAll("[data-rest]").forEach((chip) =>
    chip.addEventListener("click", () => startRest(Number(chip.dataset.rest)))
  );

  view.querySelector("#finishBtn")?.addEventListener("click", () => {
    toggleSession(route.dayId);
    navigator.vibrate?.(20);
    render();
  });

  view.querySelector("#logWeightBtn")?.addEventListener("click", openWeightSheet);
  view.querySelector("#editProfileBtn")?.addEventListener("click", openProfileSheet);
  bindAvatar(view);

  view.querySelectorAll("[data-units]").forEach((b) =>
    b.addEventListener("click", () => {
      saveProfile({ units: b.dataset.units });
      render();
    })
  );

  view.querySelectorAll("[data-theme-set]").forEach((b) =>
    b.addEventListener("click", () => {
      write(K_THEME, b.dataset.themeSet);
      applyTheme(b.dataset.themeSet);
      render();
    })
  );

  view.querySelector("#exportBtn")?.addEventListener("click", () => {
    const blob = new Blob(
      [JSON.stringify({ profile: getProfile(), sessions: getSessions(), weights: getWeights(), ticks: getTicks() }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fitfour-${dateKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  view.querySelector("#resetBtn")?.addEventListener("click", () => {
    openSheet(
      `
      <h3>Reset all data?</h3>
      <p class="sheet-sub">This permanently deletes your profile, workout history, and weight log from this device. It cannot be undone.</p>
      <div class="btn-row"><button class="btn" style="background:var(--coral);box-shadow:none" id="confirmReset">Delete everything</button></div>
      <div style="margin-top:10px"><button class="btn secondary" data-sheet-close>Keep my data</button></div>
      `,
      (sheet) =>
        sheet.querySelector("#confirmReset").addEventListener("click", () => {
          [K_SESSIONS, K_WEIGHTS, K_TICKS, PROFILE_KEY].forEach((k) => localStorage.removeItem(k));
          closeSheet();
          route = { tab: "today", dayId: null };
          render();
        })
    );
  });
}

// ---------------------------------------------------------------- render
const NAV_CLASSES = ["nav-fade", "nav-push", "nav-pop"];

function render() {
  renderAppbar();
  buildTabbar();
  updateTabbar();

  const view = document.getElementById("screen");
  view.classList.remove(...NAV_CLASSES);

  if (route.dayId) view.innerHTML = screenDay(route.dayId);
  else if (route.tab === "today") view.innerHTML = screenToday();
  else if (route.tab === "plan") view.innerHTML = screenPlan();
  else if (route.tab === "progress") view.innerHTML = screenProgress();
  else view.innerHTML = screenProfile();

  // Reflow between removing and re-adding so the animation actually restarts.
  void view.offsetWidth;
  view.classList.add(`nav-${nav}`);
  nav = "fade";

  bindScreen(view);
}

// ---------------------------------------------------------------- init
applyTheme(activeTheme());

// Follow the OS only while the user hasn't picked a theme themselves.
window.matchMedia?.("(prefers-color-scheme: light)").addEventListener?.("change", () => {
  if (!read(K_THEME, null)) {
    applyTheme(systemTheme());
    render();
  }
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-sheet-close]")) closeSheet();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSheet();
});

// Reveal the compact app-bar title once the large title scrolls away.
window.addEventListener(
  "scroll",
  () => document.getElementById("appbar").classList.toggle("scrolled", window.scrollY > 20),
  { passive: true }
);

render();
