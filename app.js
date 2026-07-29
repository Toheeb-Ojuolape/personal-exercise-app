// FitFour — vanilla JS single-page app. No build step, no dependencies.

const STORAGE_SESSIONS = "fitfour.sessions";
const STORAGE_WEIGHTS = "fitfour.weights";

const TABS = [
  { id: "home", label: "Home" },
  ...WORKOUTS.map((d) => ({ id: d.id, label: d.day })),
  { id: "nutrition", label: "Nutrition" },
  { id: "progress", label: "Progress" },
];

let currentTab = "home";

// ---------- storage helpers ----------
function getSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SESSIONS)) || []; }
  catch { return []; }
}
function saveSessions(list) {
  localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(list));
}
function getWeights() {
  try { return JSON.parse(localStorage.getItem(STORAGE_WEIGHTS)) || []; }
  catch { return []; }
}
function saveWeights(list) {
  localStorage.setItem(STORAGE_WEIGHTS, JSON.stringify(list));
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function isCompletedThisWeek(dayId) {
  const weekStart = startOfWeek(new Date());
  return getSessions().some(
    (s) => s.dayId === dayId && new Date(s.date) >= weekStart
  );
}
function isCompletedToday(dayId) {
  const today = new Date().toDateString();
  return getSessions().some(
    (s) => s.dayId === dayId && new Date(s.date).toDateString() === today
  );
}
function toggleDayComplete(dayId, title) {
  const sessions = getSessions();
  const today = new Date().toDateString();
  const idx = sessions.findIndex(
    (s) => s.dayId === dayId && new Date(s.date).toDateString() === today
  );
  if (idx >= 0) sessions.splice(idx, 1);
  else sessions.push({ date: new Date().toISOString(), dayId, title });
  saveSessions(sessions);
  render();
}

function logWeight(value) {
  const num = parseFloat(value);
  if (!num || num <= 0) return;
  const weights = getWeights();
  weights.push({ date: new Date().toISOString(), weight: num });
  saveWeights(weights);
  render();
}

// ---------- rendering ----------
function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = TABS.map(
    (t) =>
      `<button class="tab-btn${t.id === currentTab ? " active" : ""}" data-tab="${t.id}">${t.label}</button>`
  ).join("");
  tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab;
      render();
      document.getElementById("view").scrollIntoView({ behavior: "smooth" });
    });
  });
}

function renderHome() {
  const weekStart = startOfWeek(new Date());
  const sessionsThisWeek = getSessions().filter(
    (s) => new Date(s.date) >= weekStart
  ).length;
  const totalSessions = getSessions().length;

  return `
    <div class="home-hero">
      <h2>Welcome back 👋</h2>
      <p>Stick to the 4-day split, prioritize protein, and progress a little each week — that's the whole game.</p>
    </div>
    <div class="stat-row">
      <div class="stat-box">
        <div class="stat-num">${sessionsThisWeek}/4</div>
        <div class="stat-label">Sessions this week</div>
      </div>
      <div class="stat-box">
        <div class="stat-num">${totalSessions}</div>
        <div class="stat-label">Total logged</div>
      </div>
    </div>
    <div class="section-title">This Week's Schedule</div>
    ${WORKOUTS.map(
      (d, i) => `
      <div class="card day-card" data-goto="${d.id}">
        <div class="day-badge">D${i + 1}</div>
        <div class="day-info">
          <h3>${d.title}</h3>
          <p>${d.focus}</p>
        </div>
        <div class="day-check">${isCompletedThisWeek(d.id) ? "✅" : "⬜️"}</div>
      </div>`
    ).join("")}
  `;
}

function renderDay(dayId) {
  const day = WORKOUTS.find((d) => d.id === dayId);
  const done = isCompletedToday(dayId);
  return `
    <div class="day-header">
      <h2>${day.day}: ${day.title}</h2>
      <div class="focus">${day.focus}</div>
      <div class="warmup-box"><strong>Warm-up:</strong> ${day.warmup}</div>
    </div>
    ${day.exercises.map((ex) => `
      <div class="card exercise-card">
        <div class="video-thumb" data-video-id="${ex.videoId}" data-video-title="${ex.name}">
          <img src="https://img.youtube.com/vi/${ex.videoId}/hqdefault.jpg" alt="${ex.name} form demonstration video thumbnail" loading="lazy" />
          <button type="button" class="play-btn" aria-label="Play video: ${ex.name}">▶</button>
        </div>
        <div class="exercise-body">
          <h4>${ex.name}</h4>
          <div class="badge-row">
            <span class="badge accent">${ex.sets} × ${ex.reps}</span>
            <span class="badge">Rest ${ex.rest}</span>
            <span class="badge">${ex.muscle}</span>
          </div>
          <p class="cue">${ex.cue}</p>
          <a class="yt-link" href="https://www.youtube.com/watch?v=${ex.videoId}" target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>
        </div>
      </div>
    `).join("")}
    <div class="finisher-box">🔥 ${day.cardioFinisher}</div>
    <button class="complete-btn${done ? " done" : ""}" id="completeBtn">
      ${done ? "✓ Completed Today — tap to undo" : "Mark Day Complete"}
    </button>
  `;
}

function renderNutrition() {
  return `
    <div class="section-title">Nutrition Basics</div>
    ${NUTRITION_TIPS.map(
      (t) => `
      <div class="card tip-card">
        <h4>${t.title}</h4>
        <p>${t.body}</p>
      </div>`
    ).join("")}
  `;
}

function sparkline(weights) {
  if (weights.length < 2) return "";
  const sorted = [...weights].sort((a, b) => new Date(a.date) - new Date(b.date));
  const vals = sorted.map((w) => w.weight);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 300, h = 70, pad = 6;
  const points = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `
    <div class="sparkline-wrap">
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="70" preserveAspectRatio="none">
        <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>`;
}

function renderProgress() {
  const weights = getWeights();
  const weightsDesc = [...weights].sort((a, b) => new Date(b.date) - new Date(a.date));
  const sessions = getSessions();
  const sessionsDesc = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  return `
    <div class="section-title">Body Weight</div>
    <div class="card">
      <div class="log-form">
        <input type="number" id="weightInput" step="0.1" min="0" placeholder="Weight (lb or kg)" />
        <button id="logWeightBtn">Log</button>
      </div>
      ${sparkline(weights)}
      ${weightsDesc.length === 0
        ? `<p class="empty-state">No entries yet. Log your weight weekly to track trends.</p>`
        : `<table class="log-table">
            <thead><tr><th>Date</th><th>Weight</th><th>Change</th></tr></thead>
            <tbody>
              ${weightsDesc.slice(0, 10).map((w, i) => {
                const prev = weightsDesc[i + 1];
                const delta = prev ? (w.weight - prev.weight).toFixed(1) : null;
                const deltaStr = delta === null ? "—" : (delta > 0 ? `+${delta}` : delta);
                return `<tr><td>${new Date(w.date).toLocaleDateString()}</td><td>${w.weight}</td><td>${deltaStr}</td></tr>`;
              }).join("")}
            </tbody>
          </table>`
      }
    </div>

    <div class="section-title">Session History</div>
    <div class="card">
      ${sessionsDesc.length === 0
        ? `<p class="empty-state">No workouts logged yet. Complete a day to see it here.</p>`
        : `<table class="log-table">
            <thead><tr><th>Date</th><th>Workout</th></tr></thead>
            <tbody>
              ${sessionsDesc.map((s) => `<tr><td>${new Date(s.date).toLocaleDateString()}</td><td>${s.title}</td></tr>`).join("")}
            </tbody>
          </table>`
      }
    </div>
  `;
}

function render() {
  renderTabs();
  const view = document.getElementById("view");
  if (currentTab === "home") view.innerHTML = renderHome();
  else if (currentTab === "nutrition") view.innerHTML = renderNutrition();
  else if (currentTab === "progress") view.innerHTML = renderProgress();
  else view.innerHTML = renderDay(currentTab);

  // wire up interactive elements for this render pass
  view.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => {
      currentTab = el.dataset.goto;
      render();
    });
  });
  view.querySelectorAll(".video-thumb").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.videoId;
      const title = el.dataset.videoTitle || "Exercise video";
      el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${title}" frameborder="0" allow="accelerate-motion; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      el.classList.add("playing");
    });
  });
  const completeBtn = document.getElementById("completeBtn");
  if (completeBtn) {
    const day = WORKOUTS.find((d) => d.id === currentTab);
    completeBtn.addEventListener("click", () => toggleDayComplete(day.id, day.title));
  }
  const logWeightBtn = document.getElementById("logWeightBtn");
  if (logWeightBtn) {
    const input = document.getElementById("weightInput");
    logWeightBtn.addEventListener("click", () => {
      logWeight(input.value);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") logWeight(input.value);
    });
  }
}

render();
