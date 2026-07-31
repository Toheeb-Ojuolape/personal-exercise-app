// ============================================================
// FitFour — playlist + player.
//
// Everything that actually makes sound (the <audio> element, the YouTube
// iframe, the Spotify embed) lives inside #playerRoot, which sits outside
// the #screen element that render() replaces. So changing tabs, opening a
// workout, ticking an exercise or finishing a session never interrupts
// playback — only closing the tab does.
// ============================================================

const MUSIC_KEY = "fitfour.playlist";
const PLAYER_KEY = "fitfour.player";

// Position is written back this often while playing, so reopening the app
// resumes within a few seconds of where you stopped.
const SAVE_EVERY = 4000;

const mRead = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const mWrite = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

const SOURCES = {
  youtube: { label: "YouTube", icon: "youtube", tint: "#FF3D3D" },
  spotify: { label: "Spotify", icon: "spotify", tint: "#1DB954" },
  soundcloud: { label: "SoundCloud", icon: "soundcloud", tint: "#FF5500" },
  audio: { label: "Audio link", icon: "wave", tint: "var(--brand)" },
};

// ---------------------------------------------------------------- parsing
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
const SPOTIFY_TYPES = ["track", "album", "playlist", "episode", "show", "artist"];

const ytTrack = (videoId, listId = null) => ({
  kind: "youtube",
  videoId,
  listId,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  art: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
  title: "YouTube track",
});

const ytList = (listId) => ({
  kind: "youtube",
  videoId: null,
  listId,
  url: `https://www.youtube.com/playlist?list=${listId}`,
  art: null,
  title: "YouTube playlist",
});

const scTrack = (url) => ({
  kind: "soundcloud",
  scUrl: url,
  listId: /\/sets\//.test(url) ? "set" : null, // sets play through as a playlist
  url,
  art: null,
  title: "SoundCloud track",
});

const spTrack = (type, id) => ({
  kind: "spotify",
  spType: type,
  spId: id,
  uri: `spotify:${type}:${id}`,
  url: `https://open.spotify.com/${type}/${id}`,
  art: null,
  title: `Spotify ${type}`,
});

/** Turn a filename into something readable: "my_song-final.mp3" → "My song final". */
function prettyFilename(pathname) {
  const base = decodeURIComponent(pathname.split("/").pop() || "").replace(AUDIO_EXT, "");
  const words = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Audio track";
}

/**
 * Work out what a pasted link is. Handles youtube.com, music.youtube.com,
 * youtu.be, Spotify links and URIs, and direct audio files. Anything else
 * that looks like a URL is optimistically treated as an audio stream.
 */
function parseTrackUrl(raw) {
  const input = String(raw || "").trim();
  if (!input) return null;

  const uri = input.match(/^spotify:([a-z]+):([A-Za-z0-9]+)/i);
  if (uri && SPOTIFY_TYPES.includes(uri[1].toLowerCase())) {
    return spTrack(uri[1].toLowerCase(), uri[2]);
  }

  // A bare video id, for anyone who pastes just that.
  if (/^[\w-]{11}$/.test(input)) return ytTrack(input);

  let u;
  try { u = new URL(input.includes("://") ? input : `https://${input}`); }
  catch { return null; }

  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const seg = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" && seg[0]) return ytTrack(seg[0]);

  // Covers youtube.com and music.youtube.com alike. A `list` param on a watch
  // link is ignored on purpose: YouTube Music appends an endless radio mix
  // (list=RDAMVM…) to every share link, and starting a radio nobody asked for
  // is worse than playing the one track that was actually picked. Playlists
  // come in through the /playlist form below.
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const v = u.searchParams.get("v");
    const list = u.searchParams.get("list");
    if (v) return ytTrack(v);
    if (["embed", "shorts", "v", "live"].includes(seg[0]) && seg[1]) return ytTrack(seg[1]);
    if (list) return ytList(list);
    return null;
  }

  if (host === "open.spotify.com" || host === "play.spotify.com") {
    const i = seg.findIndex((s) => SPOTIFY_TYPES.includes(s));
    if (i >= 0 && seg[i + 1]) return spTrack(seg[i], seg[i + 1].split("?")[0]);
    return null;
  }

  // SoundCloud needs no key or account — the widget resolves the URL itself.
  // Short on.soundcloud.com links don't resolve, so send people to the full one.
  if (host === "soundcloud.com" || host === "m.soundcloud.com") {
    return seg.length >= 2 ? scTrack(`https://soundcloud.com/${seg.join("/")}`) : null;
  }
  if (host === "on.soundcloud.com") return null;

  // Anything left has to at least look like a web address before we hand it
  // to an <audio> element — "hello world" must not become a track.
  if (!/^https?:$/.test(u.protocol)) return null;
  if (/\s/.test(input) || !u.hostname.includes(".")) return null;

  return {
    kind: "audio",
    src: u.href,
    url: u.href,
    art: null,
    title: AUDIO_EXT.test(u.pathname) ? prettyFilename(u.pathname) : host,
  };
}

/**
 * Ask the platform for a real title and artwork. Both oEmbed endpoints are
 * public and CORS-enabled; a failure just leaves the placeholder in place.
 */
async function fetchTrackMeta(track) {
  const endpoints = {
    youtube: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(track.url)}`,
    spotify: `https://open.spotify.com/oembed?url=${encodeURIComponent(track.url)}`,
    soundcloud: `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(track.url)}`,
  };
  const endpoint = endpoints[track.kind];
  if (!endpoint) return null;

  try {
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || track.title,
      subtitle: data.author_name || SOURCES[track.kind].label,
      art: data.thumbnail_url || track.art,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- playlist
const getPlaylist = () => mRead(MUSIC_KEY, []);
const savePlaylist = (list) => mWrite(MUSIC_KEY, list);

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Add a pasted link. Returns { ok } or { ok:false, error }. */
async function addTrack(rawUrl, customTitle = "") {
  const parsed = parseTrackUrl(rawUrl);
  if (!parsed) {
    return { ok: false, error: "That doesn't look like a YouTube, Spotify, or audio link." };
  }

  const list = getPlaylist();
  const dupe = list.find((t) => t.url === parsed.url);
  if (dupe) return { ok: false, error: "That's already in your playlist." };

  const track = {
    id: newId(),
    ...parsed,
    title: customTitle.trim() || parsed.title,
    subtitle: SOURCES[parsed.kind].label,
    named: Boolean(customTitle.trim()), // a hand-typed name wins over oEmbed
    addedAt: Date.now(),
  };

  list.push(track);
  savePlaylist(list);
  rebuildOrder();
  paintPlayer();

  // Deliberately not awaited: the sheet closes straight away and the flag
  // lands on the row a few seconds later, while you're still looking at it.
  probeNewTrack(track);

  const meta = await fetchTrackMeta(track);
  if (meta) patchTrack(track.id, { ...(track.named ? { subtitle: meta.subtitle, art: meta.art } : meta) });
  return { ok: true, track };
}

function patchTrack(id, patch) {
  const list = getPlaylist();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch };
  savePlaylist(list);
  paintPlayer();
  // Row markup carries the title, artwork and blocked state, so the list has
  // to be rebuilt — patching the player's own elements isn't enough.
  window.dispatchEvent(new CustomEvent("music:changed"));
}

function removeTrack(id) {
  savePlaylist(getPlaylist().filter((t) => t.id !== id));
  if (P.trackId === id) {
    stopPlayback();
    P.trackId = null;
    P.kind = null;
    P.position = 0;
    P.duration = 0;
    forgetPlayerState();
  }
  rebuildOrder();
  paintPlayer();
}

function moveTrack(id, dir) {
  const list = getPlaylist();
  const i = list.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  savePlaylist(list);
  rebuildOrder();
  paintPlayer();
}

// ---------------------------------------------------------------- state
const P = {
  trackId: null,
  kind: null,
  playing: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: "off", // off | all | one
  order: [],
  error: "",
  expanded: false,
  loading: false,
};

const current = () => getPlaylist().find((t) => t.id === P.trackId) || null;

function rebuildOrder() {
  const ids = getPlaylist().map((t) => t.id);
  if (!P.shuffle) {
    P.order = ids;
    return;
  }
  const rest = ids.filter((id) => id !== P.trackId);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  P.order = P.trackId && ids.includes(P.trackId) ? [P.trackId, ...rest] : rest;
}

let lastSaved = 0;
function savePlayerState(force = false) {
  const now = Date.now();
  if (!force && now - lastSaved < SAVE_EVERY) return;
  lastSaved = now;

  // With nothing loaded there is nothing to resume, and writing a null track
  // here would wipe a good resume point on the way out of the page. Clearing
  // the stored state is the caller's job — see forgetPlayerState().
  if (!P.trackId) return;

  mWrite(PLAYER_KEY, {
    trackId: P.trackId,
    position: P.position,
    shuffle: P.shuffle,
    repeat: P.repeat,
  });
}

/** Drop the resume point — the track it named is gone. */
function forgetPlayerState() {
  try { localStorage.removeItem(PLAYER_KEY); } catch {}
}

// ---------------------------------------------------------------- engines
let audioEl = null;

function audio() {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.preload = "metadata";
  audioEl.addEventListener("timeupdate", () => {
    if (P.kind !== "audio") return;
    P.position = audioEl.currentTime;
    P.duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    paintProgress();
    savePlayerState();
  });
  audioEl.addEventListener("play", () => setPlaying(true));
  audioEl.addEventListener("pause", () => setPlaying(false));
  audioEl.addEventListener("ended", () => advance(1, true));
  audioEl.addEventListener("error", () => fail("That audio link couldn't be played."));
  return audioEl;
}

/** Load a third-party player script once, resolving when its API is ready. */
function loadScriptApi(key, src, install) {
  if (window[key]) return window[key];
  window[key] = new Promise((resolve, reject) => {
    install(resolve);
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onerror = () => reject(new Error("That player couldn't be loaded — check your connection."));
    document.head.appendChild(s);
  });
  return window[key];
}

const loadYouTubeApi = () =>
  loadScriptApi("__ytApi", "https://www.youtube.com/iframe_api", (resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
  });

const loadSpotifyApi = () =>
  loadScriptApi("__spApi", "https://open.spotify.com/embed/iframe-api/v1", (resolve) => {
    window.onSpotifyIframeApiReady = (api) => resolve(api);
  });

let ytPlayer = null;

async function youtube() {
  if (ytPlayer) return ytPlayer;
  const YT = await loadYouTubeApi();
  await new Promise((resolve) => {
    ytPlayer = new YT.Player("ytHost", {
      host: "https://www.youtube-nocookie.com",
      playerVars: { playsinline: 1, controls: 0, rel: 0, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady: resolve,
        onStateChange: onYouTubeState,
        onError: (e) => onYouTubeError(e.data),
      },
    });
  });
  return ytPlayer;
}

/** How many videos the player currently holds — 0 when it's a single video. */
function ytLoadedPlaylistLength() {
  try { return ytPlayer?.getPlaylist?.()?.length || 0; }
  catch { return 0; }
}

function onYouTubeState(e) {
  if (P.kind !== "youtube") return;
  const S = window.YT?.PlayerState || {};

  if (e.data === S.PLAYING) {
    setPlaying(true);
    adoptYouTubeTitle();
  } else if (e.data === S.PAUSED) {
    setPlaying(false);
  } else if (e.data === S.ENDED) {
    // Inside a YouTube playlist, let YouTube walk its own list first.
    const items = ytLoadedPlaylistLength();
    const atEnd = items === 0 || (ytPlayer.getPlaylistIndex?.() ?? -1) >= items - 1;
    if (atEnd) advance(1, true);
  }
}

// YouTube's documented player error codes.
const YT_ERRORS = {
  2: "That YouTube link is malformed.",
  5: "YouTube's player couldn't handle that track.",
  100: "That video has been removed, or is private.",
  // YouTube returns 101/150 both when embedding is switched off and when a
  // video is unavailable here, so the wording has to cover both.
  101: "This one can't be played outside YouTube.",
  150: "This one can't be played outside YouTube.",
};

/**
 * Embedding is a per-video permission, and plenty of licensed music turns it
 * off. Flag the track so the playlist says so, then carry on down the queue
 * instead of stalling mid-workout.
 */
function onYouTubeError(code) {
  const track = current();
  const message = YT_ERRORS[code] || "YouTube couldn't play that track.";
  if (track) patchTrack(track.id, { blocked: message });
  fail(message);
  skipUnplayable();
}

// ---------------------------------------------------------------- probe
// Embeddability is only knowable by asking YouTube. cueVideoById loads a
// video's data *without playing it*, and a blocked video reports the same
// 101/150 it would at playback time — so a muted, hidden second player can
// find out the moment a link is pasted rather than mid-workout. No API key.
let ytProbe = null;
let probeSettle = null;
let probeChain = Promise.resolve();

async function youtubeProbe() {
  if (ytProbe) return ytProbe;
  const YT = await loadYouTubeApi();
  await new Promise((resolve) => {
    ytProbe = new YT.Player("ytProbeHost", {
      host: "https://www.youtube-nocookie.com",
      playerVars: { playsinline: 1, controls: 0 },
      events: {
        onReady: resolve,
        onError: (e) => probeSettle?.({ ok: false, code: e.data }),
        // 5 = cued: YouTube accepted it for embedded playback.
        onStateChange: (e) => e.data === 5 && probeSettle?.({ ok: true }),
      },
    });
  });
  return ytProbe;
}

/**
 * Resolves { ok } for one video. Probes run one at a time — a single player
 * can only hold one video — and anything inconclusive counts as playable, so
 * a slow network never wrongly brands a working track.
 */
function checkYouTubeEmbeddable(videoId) {
  const run = async () => {
    try {
      const player = await youtubeProbe();
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (verdict) => {
          if (settled) return;
          settled = true;
          probeSettle = null;
          clearTimeout(timer);
          resolve(verdict);
        };
        probeSettle = finish;
        const timer = setTimeout(() => finish({ ok: true, inconclusive: true }), 8000);
        player.mute?.();
        player.cueVideoById(videoId);
      });
    } catch {
      return { ok: true, inconclusive: true };
    }
  };
  probeChain = probeChain.then(run, run);
  return probeChain;
}

/** Flag a freshly added YouTube track if it can't actually play here. */
async function probeNewTrack(track) {
  if (track.kind !== "youtube" || !track.videoId) return;
  const verdict = await checkYouTubeEmbeddable(track.videoId);
  if (verdict.ok || !getPlaylist().some((t) => t.id === track.id)) return;
  patchTrack(track.id, {
    blocked: YT_ERRORS[verdict.code] || "YouTube won't play this one in-app.",
  });
}

// Guards against walking a queue where every track is blocked.
let failStreak = 0;

function skipUnplayable() {
  const ids = P.order;
  if (ids.length < 2) return;

  failStreak += 1;
  if (failStreak >= ids.length) {
    failStreak = 0;
    return; // the whole queue refused — stop rather than spin
  }
  const i = Math.max(0, ids.indexOf(P.trackId));
  playTrack(ids[(i + 1) % ids.length]);
}

/** Give a pasted link its real name once YouTube reports one. */
function adoptYouTubeTitle() {
  const track = current();
  if (!track || track.named) return;
  const data = ytPlayer?.getVideoData?.();
  if (!data?.title || data.title === track.title) return;
  patchTrack(track.id, {
    title: data.title,
    subtitle: data.author || SOURCES.youtube.label,
    art: data.video_id ? `https://img.youtube.com/vi/${data.video_id}/mqdefault.jpg` : track.art,
  });
}

let spCtrl = null;
let spEnded = false;

async function spotify(uri) {
  if (spCtrl) {
    spCtrl.loadUri(uri);
    return spCtrl;
  }
  const api = await loadSpotifyApi();
  const host = document.getElementById("spHost");
  return new Promise((resolve) => {
    api.createController(host, { uri, width: "100%", height: "100%" }, (ctrl) => {
      spCtrl = ctrl;
      ctrl.addListener("playback_update", (e) => onSpotifyUpdate(e?.data || {}));
      resolve(ctrl);
    });
  });
}

/**
 * The Web Playback SDK pushes a full state object on every change — position,
 * duration, pause state and the track that's actually playing (which may have
 * moved on by itself inside an album or playlist context).
 */
function onSpotifySdkState(state) {
  if (P.kind !== "spotify") return;

  P.position = (state.position || 0) / 1000;
  P.duration = (state.duration || 0) / 1000;
  setPlaying(!state.paused);
  paintProgress();
  savePlayerState();

  const item = state.track_window?.current_track;
  const track = current();
  if (item && track) {
    const artists = (item.artists || []).map((a) => a.name).join(", ");
    const art = item.album?.images?.[0]?.url;
    const title = item.name;
    // Only write when something actually changed, or we'd loop on every tick.
    if ((!track.named && track.title !== title) || track.subtitle !== artists || track.art !== art) {
      patchTrack(track.id, {
        ...(track.named ? {} : { title: title || track.title }),
        subtitle: artists || SOURCES.spotify.label,
        art: art || track.art,
      });
    }
  }

  // A context that has run to its end reports paused at position 0.
  if (state.paused && state.position === 0 && P.duration > 0 && !spEnded) {
    spEnded = true;
    advance(1, true);
  } else if (!state.paused) {
    spEnded = false;
  }
}

function onSpotifyUpdate(d) {
  if (P.kind !== "spotify") return;
  P.position = (d.position || 0) / 1000;
  P.duration = (d.duration || 0) / 1000;
  setPlaying(!d.isPaused);
  paintProgress();
  savePlayerState();

  // The embed reports a pause at full duration when a track finishes.
  const finished = P.duration > 0 && d.isPaused && P.position >= P.duration - 0.4;
  if (finished && !spEnded) {
    spEnded = true;
    advance(1, true);
  } else if (!finished) {
    spEnded = false;
  }
}

// ---------------------------------------------------------------- SoundCloud
// The Widget API needs no key and no registration — it resolves a public
// track URL itself. Its calls are callback-based rather than promise-based.
let scWidget = null;
let scLoaded = null;

const loadSoundCloudApi = () =>
  loadScriptApi("__scApi", "https://w.soundcloud.com/player/api.js", (resolve) => {
    const poll = setInterval(() => {
      if (window.SC?.Widget) {
        clearInterval(poll);
        resolve(window.SC);
      }
    }, 40);
  });

async function soundcloud(url) {
  await loadSoundCloudApi();
  const frame = document.getElementById("scHost");

  // Same widget, different track: load() is far cheaper than a fresh iframe.
  if (scWidget && scLoaded === url) return scWidget;
  if (scWidget) {
    scLoaded = url;
    return new Promise((resolve) => {
      scWidget.load(url, {
        auto_play: true,
        show_artwork: true,
        callback: () => {
          bindSoundCloudMeta();
          resolve(scWidget);
        },
      });
    });
  }

  frame.src =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(url) +
    "&auto_play=true&show_artwork=true&sharing=false&download=false&buying=false";
  scLoaded = url;
  scWidget = SC.Widget(frame);

  return new Promise((resolve) => {
    scWidget.bind(SC.Widget.Events.READY, () => {
      const E = SC.Widget.Events;
      scWidget.bind(E.PLAY, () => {
        if (P.kind === "soundcloud") {
          setPlaying(true);
          bindSoundCloudMeta();
        }
      });
      scWidget.bind(E.PAUSE, () => P.kind === "soundcloud" && setPlaying(false));
      scWidget.bind(E.FINISH, () => P.kind === "soundcloud" && advance(1, true));
      scWidget.bind(E.PLAY_PROGRESS, (e) => {
        if (P.kind !== "soundcloud") return;
        P.position = (e?.currentPosition || 0) / 1000;
        paintProgress();
        savePlayerState();
      });
      scWidget.bind(E.ERROR, () => {
        const track = current();
        if (track) patchTrack(track.id, { blocked: "SoundCloud won't play this one here." });
        fail("SoundCloud won't play this one here.");
        skipUnplayable();
      });
      resolve(scWidget);
    });
  });
}

let scWatchdog = null;

/**
 * SoundCloud refuses rights-restricted tracks silently — no ERROR event fires,
 * the widget simply never leaves 0:00 (its own play button does nothing either).
 * So give it a few seconds and then treat it like any other unplayable track.
 */
function watchSoundCloudStart(trackId) {
  clearTimeout(scWatchdog);
  scWatchdog = setTimeout(() => {
    if (P.kind !== "soundcloud" || P.trackId !== trackId || P.playing) return;
    scWidget?.isPaused?.((paused) => {
      if (!paused || P.trackId !== trackId || P.playing) return;
      const message = "SoundCloud won't play this one outside soundcloud.com.";
      patchTrack(trackId, { blocked: message });
      fail(message);
      skipUnplayable();
    });
  }, 7000);
}

/** Pull the real title, artist and artwork off whatever the widget loaded. */
function bindSoundCloudMeta() {
  scWidget?.getDuration?.((ms) => {
    if (P.kind === "soundcloud") {
      P.duration = (ms || 0) / 1000;
      paintProgress();
    }
  });
  scWidget?.getCurrentSound?.((sound) => {
    const track = current();
    if (!sound || !track || P.kind !== "soundcloud") return;
    const art = sound.artwork_url?.replace("-large", "-t300x300") || track.art;
    patchTrack(track.id, {
      ...(track.named ? {} : { title: sound.title || track.title }),
      subtitle: sound.user?.username || SOURCES.soundcloud.label,
      art,
    });
  });
}

/** Silence every engine except the one about to be used. */
function stopOthers(keep) {
  if (keep !== "audio" && audioEl) audioEl.pause();
  if (keep !== "youtube" && ytPlayer?.pauseVideo) ytPlayer.pauseVideo();
  if (keep !== "soundcloud" && scWidget?.pause) scWidget.pause();
  if (keep !== "spotify") {
    spCtrl?.pause?.();
    if (typeof spotifySdkLive === "function" && spotifySdkLive()) spotifyPause();
  }
}

// ---------------------------------------------------------------- transport
function setPlaying(on) {
  // Track-to-track skips keep `playing` true throughout, so the loading flag
  // has to clear on the repeat call too or the spinner never goes away.
  const changed = P.playing !== on || (on && P.loading);
  P.playing = on;

  if (on) {
    P.loading = false;
    failStreak = 0;
    // It played, so whatever we flagged about it last time no longer holds.
    const track = current();
    if (track?.blocked) patchTrack(track.id, { blocked: null });
  }
  if (!changed) return;

  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = on ? "playing" : "paused";
  savePlayerState(true);
  paintPlayer();
}

function fail(message) {
  P.error = message;
  P.loading = false;
  P.playing = false;
  paintPlayer();
}

async function playTrack(id, { resumeAt = 0 } = {}) {
  const track = getPlaylist().find((t) => t.id === id);
  if (!track) return;

  const switching = P.trackId !== id;
  P.error = "";
  P.trackId = id;
  P.kind = track.kind;
  P.loading = true;
  if (switching) {
    P.position = resumeAt;
    P.duration = 0;
  }
  stopOthers(track.kind);
  rebuildOrder();
  paintPlayer();
  updateMediaSession(track);

  try {
    if (track.kind === "audio") {
      const el = audio();
      if (el.src !== track.src) el.src = track.src;
      if (resumeAt) el.currentTime = resumeAt;
      await el.play();
    } else if (track.kind === "youtube") {
      const yt = await youtube();
      if (track.listId && !track.videoId) {
        yt.loadPlaylist({ list: track.listId, listType: "playlist", index: 0 });
      } else if (switching || yt.getVideoData?.()?.video_id !== track.videoId) {
        yt.loadVideoById({ videoId: track.videoId, startSeconds: resumeAt || 0 });
      } else {
        yt.playVideo();
      }
    } else if (track.kind === "soundcloud") {
      const w = await soundcloud(track.scUrl);
      w.play();
      if (resumeAt) w.seekTo(resumeAt * 1000);
      watchSoundCloudStart(track.id);
    } else if (spotifyConnected()) {
      // Connected: the Web Playback SDK streams the whole track.
      await spotifyPlayUri(track.uri, resumeAt * 1000);
    } else {
      // Not connected: the embed, which is preview-only for most listeners.
      const ctrl = await spotify(track.uri);
      spEnded = false;
      // The embed loads paused; play() exists on current builds, toggle covers older ones.
      if (ctrl.play) ctrl.play();
      else ctrl.togglePlay();
      if (resumeAt) setTimeout(() => ctrl.seek?.(resumeAt), 600);
    }
    P.loading = false;
    paintPlayer();
  } catch (err) {
    fail(err?.message || "That track couldn't be played.");
  }
  savePlayerState(true);
}

function pausePlayback() {
  if (P.kind === "audio") audioEl?.pause();
  else if (P.kind === "youtube") ytPlayer?.pauseVideo?.();
  else if (P.kind === "soundcloud") scWidget?.pause?.();
  else if (P.kind === "spotify") spotifySdkLive() ? spotifyPause() : spCtrl?.pause?.();
  setPlaying(false);
}

function stopPlayback() {
  pausePlayback();
  P.loading = false;
}

function togglePlay() {
  const track = current();
  if (!track) return;
  if (P.playing) return pausePlayback();

  // Nothing is loaded yet after a fresh app open — start from where we stopped.
  const needsLoad =
    (track.kind === "audio" && (!audioEl || !audioEl.src)) ||
    (track.kind === "youtube" && !ytPlayer) ||
    (track.kind === "soundcloud" && !scWidget) ||
    (track.kind === "spotify" && (spotifyConnected() ? !spotifySdkLive() : !spCtrl));

  if (needsLoad) return playTrack(track.id, { resumeAt: P.position });

  if (track.kind === "audio") audioEl.play().catch(() => fail("That audio link couldn't be played."));
  else if (track.kind === "youtube") ytPlayer.playVideo();
  else if (track.kind === "soundcloud") scWidget.play();
  else if (spotifySdkLive()) spotifyResume();
  else spCtrl.play ? spCtrl.play() : spCtrl.togglePlay();
}

function advance(dir, auto = false) {
  const ids = P.order;
  if (!ids.length) return;

  if (auto && P.repeat === "one") return playTrack(P.trackId);

  // Inside a YouTube playlist the skip buttons move within that playlist. Ask
  // the player what it actually holds rather than trusting the track's listId
  // — nextVideo() on a single loaded video is a silent no-op.
  if (!auto && P.kind === "youtube" && ytLoadedPlaylistLength() > 1) {
    dir > 0 ? ytPlayer.nextVideo() : ytPlayer.previousVideo();
    return;
  }

  // Same idea for a SoundCloud set and a Spotify album/playlist context.
  if (!auto && P.kind === "soundcloud" && current()?.listId && scWidget) {
    dir > 0 ? scWidget.next() : scWidget.prev();
    return;
  }
  if (!auto && P.kind === "spotify" && spotifySdkLive() && /^spotify:(album|playlist|artist|show):/.test(current()?.uri || "")) {
    dir > 0 ? spotifyNext() : spotifyPrevious();
    return;
  }

  const i = Math.max(0, ids.indexOf(P.trackId));
  const n = i + dir;

  if (n >= ids.length) {
    if (auto && P.repeat !== "all") return stopPlayback();
    return playTrack(ids[0]);
  }
  if (n < 0) return playTrack(ids[ids.length - 1]);
  playTrack(ids[n]);
}

function seekTo(seconds) {
  const s = Math.max(0, seconds);
  P.position = s;
  if (P.kind === "audio" && audioEl) audioEl.currentTime = s;
  else if (P.kind === "youtube") ytPlayer?.seekTo?.(s, true);
  else if (P.kind === "soundcloud") scWidget?.seekTo?.(s * 1000);
  else if (P.kind === "spotify") spotifySdkLive() ? spotifySeek(s * 1000) : spCtrl?.seek?.(s);
  paintProgress();
  savePlayerState(true);
}

function toggleShuffle() {
  P.shuffle = !P.shuffle;
  rebuildOrder();
  savePlayerState(true);
  paintPlayer();
}

function cycleRepeat() {
  P.repeat = P.repeat === "off" ? "all" : P.repeat === "all" ? "one" : "off";
  savePlayerState(true);
  paintPlayer();
}

// ---------------------------------------------------------------- OS controls
function updateMediaSession(track) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.subtitle || SOURCES[track.kind].label,
    album: "FitFour",
    artwork: track.art ? [{ src: track.art, sizes: "320x180", type: "image/jpeg" }] : [],
  });

  const set = (action, handler) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  };
  set("play", () => togglePlay());
  set("pause", () => pausePlayback());
  set("previoustrack", () => advance(-1));
  set("nexttrack", () => advance(1));
  set("seekto", (e) => e.seekTime != null && seekTo(e.seekTime));
}

// ---------------------------------------------------------------- chrome
const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/** Artwork markup — real thumbnail where we have one, tinted glyph otherwise. */
function artHtml(track, size = 22) {
  if (!track) return "";
  if (track.art) return `<img src="${esc(track.art)}" alt="" loading="lazy" />`;
  const src = SOURCES[track.kind];
  return `<span class="art-glyph" style="color:${src.tint}">${icon(src.icon, size)}</span>`;
}

function buildPlayerRoot() {
  const root = document.getElementById("playerRoot");
  if (!root || root.dataset.built) return;
  root.dataset.built = "1";

  root.innerHTML = `
    <section class="np" id="npPanel" aria-hidden="true" aria-label="Now playing">
      <header class="np-head">
        <button class="icon-btn" data-music="collapse" aria-label="Close the player">${icon("chevronDown", 22)}</button>
        <span class="np-head-title">Now playing</span>
        <span class="appbar-spacer"></span>
      </header>

      <div class="np-body">
        <div class="np-stage js-np-stage">
          <div class="np-slot" data-slot="youtube"><div id="ytHost"></div></div>
          <div class="np-slot" data-slot="spotify"><div id="spHost"></div></div>
          <div class="np-slot" data-slot="soundcloud">
            <iframe id="scHost" title="SoundCloud player" frameborder="0"
                    allow="autoplay; encrypted-media" scrolling="no"></iframe>
          </div>
          <div class="np-slot" data-slot="audio"><div class="np-artwork js-np-art"></div></div>
        </div>

        <div class="np-meta">
          <div class="np-title js-np-title"></div>
          <div class="np-sub js-np-sub"></div>
        </div>

        <p class="np-error js-np-error" hidden></p>

        <div class="scrub js-scrub" role="slider" tabindex="0"
             aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="scrub-track"><div class="scrub-fill js-bar"></div><span class="scrub-knob js-knob"></span></div>
          <div class="scrub-times"><span class="tnum js-elapsed">0:00</span><span class="tnum js-total">--:--</span></div>
        </div>

        <div class="np-controls">
          <button class="ctl ghost js-shuffle" data-music="shuffle" aria-label="Shuffle">${icon("shuffle", 20)}</button>
          <button class="ctl" data-music="prev" aria-label="Previous track">${icon("prev", 24)}</button>
          <button class="ctl main js-play" data-music="toggle" aria-label="Play"></button>
          <button class="ctl" data-music="next" aria-label="Next track">${icon("next", 24)}</button>
          <button class="ctl ghost js-repeat" data-music="repeat" aria-label="Repeat">${icon("repeat", 20)}</button>
        </div>

        <div class="np-queue">
          <div class="section-head"><h3>Up next</h3></div>
          <div class="card rows js-queue"></div>
        </div>
      </div>
    </section>

    <!-- Muted, never seen: only used to ask YouTube whether a video may be
         embedded. Kept out of .np-stage so it can't disturb what's playing. -->
    <div class="np-probe" aria-hidden="true"><div id="ytProbeHost"></div></div>

    <div class="mini" data-music="expand" role="button" tabindex="0" aria-label="Open the player">
      <span class="mini-art js-np-art"></span>
      <span class="mini-meta">
        <span class="mini-title js-np-title"></span>
        <span class="mini-sub js-np-sub"></span>
      </span>
      <button class="mini-btn js-play" data-music="toggle" aria-label="Play"></button>
      <button class="mini-btn" data-music="next" aria-label="Next track">${icon("next", 20)}</button>
      <span class="mini-bar"><span class="js-bar"></span></span>
    </div>
  `;
}

/** Full repaint: track identity, transport state, queue. */
function paintPlayer() {
  const root = document.getElementById("playerRoot");
  if (!root) return;

  const track = current();
  const onMusicTab = document.body.dataset.tab === "music";

  root.hidden = !track;
  root.classList.toggle("expanded", P.expanded && Boolean(track));
  root.classList.toggle("mini-hidden", onMusicTab && !P.expanded);
  document.documentElement.style.setProperty(
    "--mini-h",
    track && !onMusicTab ? "62px" : "0px"
  );
  document.getElementById("npPanel")?.setAttribute("aria-hidden", String(!P.expanded));

  // The music screen swaps its whole hero between "nothing loaded" and the
  // now-playing card, so ask for a re-render rather than patching two very
  // different layouts. The re-render calls back in here with shapes matched.
  if (onMusicTab && Boolean(document.querySelector(".np-card")) !== Boolean(track)) {
    window.dispatchEvent(new CustomEvent("music:changed"));
    return;
  }
  if (!track) return;

  const src = SOURCES[track.kind];
  const playIcon = P.loading
    ? `<span class="spinner" aria-hidden="true"></span>`
    : icon(P.playing ? "pause" : "play", 22);

  document.querySelectorAll(".js-np-title").forEach((el) => (el.textContent = track.title));
  document.querySelectorAll(".js-np-sub").forEach((el) => (el.textContent = track.subtitle || src.label));
  document.querySelectorAll(".js-np-art").forEach((el) => (el.innerHTML = artHtml(track)));
  document.querySelectorAll(".js-play").forEach((el) => {
    el.innerHTML = playIcon;
    el.setAttribute("aria-label", P.playing ? "Pause" : "Play");
    el.classList.toggle("loading", P.loading);
  });
  document.querySelectorAll(".js-np-state").forEach(
    (el) => (el.textContent = P.loading ? "Loading" : P.playing ? "Now playing" : "Paused")
  );
  document.querySelectorAll(".js-shuffle").forEach((el) => el.classList.toggle("on", P.shuffle));
  document.querySelectorAll(".js-repeat").forEach((el) => {
    el.classList.toggle("on", P.repeat !== "off");
    el.dataset.mode = P.repeat;
  });
  document.querySelectorAll(".js-np-error").forEach((el) => {
    el.innerHTML = P.error
      ? `${esc(P.error)} <a href="${esc(track.url)}" target="_blank" rel="noopener noreferrer">Open in ${esc(src.label)} ↗</a>`
      : "";
    el.hidden = !P.error;
  });
  document.querySelectorAll("[data-track-id]").forEach((el) => {
    const on = el.dataset.trackId === P.trackId;
    el.classList.toggle("playing", on);
    el.querySelector(".js-row-icon")?.replaceChildren();
    if (el.querySelector(".js-row-icon")) {
      el.querySelector(".js-row-icon").innerHTML = on && P.playing ? icon("pause", 16) : icon("play", 16);
    }
  });

  document.querySelector(".js-np-stage")?.setAttribute("data-kind", track.kind);

  const queue = document.querySelector(".js-queue");
  if (queue) queue.innerHTML = queueHtml();

  paintProgress();
}

/** Cheap, high-frequency update: just the scrubber. */
function paintProgress() {
  const pct = P.duration > 0 ? Math.min(100, (P.position / P.duration) * 100) : 0;
  document.querySelectorAll(".js-bar").forEach((el) => (el.style.width = `${pct}%`));
  document.querySelectorAll(".js-knob").forEach((el) => (el.style.left = `${pct}%`));
  document.querySelectorAll(".js-elapsed").forEach((el) => (el.textContent = fmtTime(P.position)));
  document.querySelectorAll(".js-total").forEach(
    (el) => (el.textContent = P.duration > 0 ? fmtTime(P.duration) : "--:--")
  );
  document.querySelectorAll(".js-scrub").forEach((el) => el.setAttribute("aria-valuenow", Math.round(pct)));
}

function queueHtml() {
  const list = getPlaylist();
  if (!list.length) return `<div class="empty">Nothing queued yet.</div>`;

  // Everything after the current track, wrapping round to what plays on repeat.
  const ids = P.order.length ? P.order : list.map((t) => t.id);
  const from = ids.indexOf(P.trackId);
  const upcoming = (from >= 0 ? [...ids.slice(from + 1), ...ids.slice(0, from)] : ids)
    .map((id) => list.find((t) => t.id === id))
    .filter(Boolean)
    .slice(0, 12);

  if (!upcoming.length) {
    return `<div class="empty">That's the only track in your playlist.</div>`;
  }

  return upcoming
    .map(
      (t) => `
      <button class="q-row" data-music="play" data-track-id="${t.id}">
        <span class="q-art">${artHtml(t, 16)}</span>
        <span class="q-body">
          <span class="q-title">${esc(t.title)}</span>
          <span class="q-sub">${esc(t.subtitle || SOURCES[t.kind].label)}</span>
        </span>
      </button>`
    )
    .join("");
}

// ---------------------------------------------------------------- screen
function musicScreenHtml() {
  const list = getPlaylist();
  const track = current();

  const emptyHero = list.length
    ? `<div class="hero music-hero">
         <div class="hero-eyebrow">Ready</div>
         <h2>${list.length} track${list.length === 1 ? "" : "s"} queued</h2>
         <p>Start the playlist and it keeps going while you train — through every screen, and while your phone is locked.</p>
         <button class="hero-cta" data-music="play" data-track-id="${list[0].id}">Play playlist</button>
       </div>`
    : `<div class="hero music-hero">
         <div class="hero-eyebrow">Playlist</div>
         <h2>Bring your own soundtrack</h2>
         <p>Paste a link from YouTube, YouTube Music, Spotify, or any .mp3 and it plays right here — through every screen of your workout.</p>
         <button class="hero-cta" data-music="add">Add your first track</button>
       </div>`;

  const hero = track
    ? `<div class="np-card">
         <div class="np-card-art js-np-art"></div>
         <div class="np-card-body">
           <div class="np-card-eyebrow js-np-state">Paused</div>
           <div class="np-title js-np-title"></div>
           <div class="np-sub js-np-sub"></div>
           <p class="np-error js-np-error" hidden></p>
           <div class="scrub js-scrub" role="slider" tabindex="0"
                aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
             <div class="scrub-track"><div class="scrub-fill js-bar"></div><span class="scrub-knob js-knob"></span></div>
             <div class="scrub-times"><span class="tnum js-elapsed">0:00</span><span class="tnum js-total">--:--</span></div>
           </div>
           <div class="np-card-controls">
             <button class="ctl ghost js-shuffle" data-music="shuffle" aria-label="Shuffle">${icon("shuffle", 18)}</button>
             <button class="ctl" data-music="prev" aria-label="Previous track">${icon("prev", 21)}</button>
             <button class="ctl main js-play" data-music="toggle" aria-label="Play"></button>
             <button class="ctl" data-music="next" aria-label="Next track">${icon("next", 21)}</button>
             <button class="ctl ghost js-repeat" data-music="repeat" aria-label="Repeat">${icon("repeat", 18)}</button>
           </div>
         </div>
       </div>`
    : emptyHero;

  const rows = list.length
    ? list
        .map(
          (t, i) => `
        <div class="track-row" data-track-id="${t.id}">
          <button class="track-main" data-music="play" data-track-id="${t.id}">
            <span class="track-art">${artHtml(t, 18)}<span class="track-play js-row-icon">${icon("play", 16)}</span></span>
            <span class="track-body">
              <span class="track-title">${esc(t.title)}</span>
              <span class="track-sub">
                ${t.blocked
                  ? `<span class="src-chip warn">${icon("info", 13)}Can't play in-app</span>`
                  : `<span class="src-chip" style="color:${SOURCES[t.kind].tint}">${icon(SOURCES[t.kind].icon, 13)}${SOURCES[t.kind].label}</span>
                     ${t.listId ? `<span class="src-chip">Playlist</span>` : ""}`}
              </span>
            </span>
          </button>
          <div class="track-tools">
            ${t.blocked
              ? `<a class="track-tool" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer"
                    title="${esc(t.blocked)}" aria-label="Open ${esc(t.title)} in ${esc(SOURCES[t.kind].label)}">${icon("link", 15)}</a>`
              : `<button class="track-tool" data-music="up" data-track-id="${t.id}" ${i === 0 ? "disabled" : ""} aria-label="Move up">${icon("chevron", 15)}</button>`}
            <button class="track-tool" data-music="remove" data-track-id="${t.id}" aria-label="Remove ${esc(t.title)}">${icon("close", 15)}</button>
          </div>
        </div>`
        )
        .join("")
    : `<div class="empty">${icon("music", 34)}Your playlist is empty. Add a link to get started.</div>`;

  return `
    <h1 class="large-title">Music</h1>
    <p class="subtitle">${list.length ? `${list.length} track${list.length === 1 ? "" : "s"} · plays across every screen` : "Your workout soundtrack"}</p>

    ${hero}

    ${spotifyConnectHtml()}

    <div class="section-head">
      <h3>Playlist</h3>
      ${list.length ? `<a class="link" data-music="add">Add track</a>` : ""}
    </div>
    <div class="card rows track-list">${rows}</div>

    ${list.length ? `<div class="btn-row"><button class="btn secondary" data-music="add">${icon("plus", 18)}<span>Add music</span></button></div>` : ""}

    <div class="note" style="margin-top:16px">
      ${icon("info", 17)}
      <div><strong>Keeps playing.</strong> Music runs through workouts, tab changes and a locked screen, with controls on your lock screen. Browsers cut all audio when the tab closes — reopen FitFour and your track picks up where it stopped. Install it to your home screen for the steadiest background playback.</div>
    </div>
  `;
}

// ---------------------------------------------------------------- Spotify UI
/** The row on the Music screen that explains and manages the connection. */
function spotifyConnectHtml() {
  // Offered once there's any playlist at all, so it can be set up before the
  // first Spotify link rather than only after one disappoints.
  if (!getPlaylist().length && !spotifyConfigured() && !spotifyConnected()) return "";

  const connected = spotifyConnected();
  return `
    <div class="section-head"><h3>Spotify</h3></div>
    <button class="card row connect-row" data-music="spotify-setup">
      <div class="row-badge" style="background:${SOURCES.spotify.tint}">${icon("spotify", 22)}</div>
      <div class="row-body">
        <div class="row-title">${connected ? "Spotify connected" : "Connect Spotify"}</div>
        <div class="row-sub">${connected
          ? `${esc(spotifyAccountName || "Playing full tracks")} · Premium streams in full`
          : "Full tracks instead of 30-second previews"}</div>
      </div>
      ${connected
        ? `<div class="week-dot done" style="width:24px;height:24px">${icon("check", 14)}</div>`
        : `<span class="chev">${icon("chevron", 18)}</span>`}
    </button>`;
}

let spotifyAccountName = "";

function openSpotifySheet() {
  const connected = spotifyConnected();
  const clientId = spotifyClientId();

  openSheet(
    `
    <h3>${connected ? "Spotify" : "Connect Spotify"}</h3>
    <p class="sheet-sub">${connected
      ? "FitFour is registered as a Spotify Connect device, so tracks play in full right here."
      : "Without this, Spotify links play as 30-second previews. Connecting streams the whole track."}</p>

    ${connected
      ? `<div class="src-help" style="margin-bottom:16px">
           <div class="src-help-row">
             <span class="src-help-icon" style="color:${SOURCES.spotify.tint}">${icon("check", 17)}</span>
             <div><strong>Connected${spotifyAccountName ? ` as ${esc(spotifyAccountName)}` : ""}</strong>
             <span>Playback needs an active Spotify Premium subscription.</span></div>
           </div>
         </div>
         <div class="btn-row"><button class="btn danger" id="spDisconnect">Disconnect Spotify</button></div>`
      : `<ol class="setup-steps">
           <li><strong>Create an app</strong> at <span class="mono">developer.spotify.com/dashboard</span>. It's free.</li>
           <li><strong>Add this exact Redirect URI</strong> to that app:
             <button class="copy-field" id="spCopyUri" title="Tap to copy">
               <span class="mono">${esc(spotifyRedirectUri())}</span>${icon("link", 15)}
             </button>
           </li>
           <li><strong>Paste the Client ID</strong> below. It's public — it's meant to ship in the page.</li>
         </ol>

         <div class="field" style="margin-top:16px">
           <label for="spClient">Client ID</label>
           <input class="input mono" id="spClient" type="text" autocomplete="off" spellcheck="false"
                  placeholder="e.g. 4c2a1f…" value="${esc(clientId)}" />
         </div>

         <p class="add-error" id="spError" hidden></p>

         <div class="note" style="margin-top:0">
           ${icon("info", 17)}
           <div>Playback requires <strong>Spotify Premium</strong> — that's Spotify's rule for the Web Playback SDK. On iPhone, Safari won't start audio on its own, so the first play of each track needs a tap.</div>
         </div>

         <div class="btn-row"><button class="btn" id="spConnect">Connect Spotify</button></div>`}
    <div style="margin-top:10px"><button class="btn secondary" data-sheet-close>${connected ? "Done" : "Cancel"}</button></div>
    `,
    (sheet) => {
      sheet.querySelector("#spCopyUri")?.addEventListener("click", (e) => {
        navigator.clipboard?.writeText(spotifyRedirectUri());
        const btn = e.currentTarget;
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1400);
      });

      sheet.querySelector("#spConnect")?.addEventListener("click", async () => {
        const error = sheet.querySelector("#spError");
        const id = sheet.querySelector("#spClient").value.trim();
        if (!id) {
          error.textContent = "Paste the Client ID from your Spotify app first.";
          error.hidden = false;
          return;
        }
        setSpotifyClientId(id);
        try {
          await spotifyLogin(); // navigates away to Spotify's consent screen
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
        }
      });

      sheet.querySelector("#spDisconnect")?.addEventListener("click", () => {
        spotifyLogout();
        spotifyAccountName = "";
        closeSheet();
        window.dispatchEvent(new CustomEvent("music:changed"));
      });
    }
  );
}

/** Finish a sign-in redirect and note who's signed in. */
async function initSpotify() {
  const result = await spotifyHandleRedirect();
  if (result?.ok === false) {
    P.error = result.error;
    paintPlayer();
  }
  if (!spotifyConnected()) return;

  onSpotifyPlayerState(onSpotifySdkState);
  try {
    const me = await spotifyMe();
    spotifyAccountName = me?.display_name || me?.id || "";
    if (me && me.product !== "premium") {
      P.error = "Spotify says this account isn't Premium — in-app playback needs it.";
    }
  } catch {
    /* the token may have been revoked; the UI will offer a reconnect */
  }
  window.dispatchEvent(new CustomEvent("music:changed"));
}

// ---------------------------------------------------------------- add sheet
function openAddMusicSheet() {
  openSheet(
    `
    <h3>Add music</h3>
    <p class="sheet-sub">Paste a link. FitFour works out the rest.</p>

    <div class="field">
      <label for="mUrl">Link</label>
      <input class="input" id="mUrl" type="url" inputmode="url" autocomplete="off"
             autocapitalize="off" spellcheck="false" placeholder="https://…" />
    </div>

    <div class="field">
      <label for="mName">Name it <span style="color:var(--text-3);font-weight:500">— optional</span></label>
      <input class="input" id="mName" type="text" placeholder="Left blank, we fetch the real title" />
    </div>

    <p class="add-error" id="mError" hidden></p>

    <div class="src-help">
      ${Object.entries(SOURCES)
        .map(
          ([kind, s]) => `
        <div class="src-help-row">
          <span class="src-help-icon" style="color:${s.tint}">${icon(s.icon, 17)}</span>
          <div>
            <strong>${s.label}</strong>
            <span>${
              kind === "youtube"
                ? "youtube.com, music.youtube.com or youtu.be — tracks and playlists"
                : kind === "spotify"
                  ? spotifyConnected()
                    ? "Tracks, albums and playlists, streamed in full through your connected account."
                    : "Tracks, albums, playlists. Connect Spotify for full tracks — otherwise you get 30-second previews."
                  : kind === "soundcloud"
                    ? "Any public track or set. No account or sign-in needed."
                    : "Any direct .mp3, .m4a, .ogg or .wav link"
            }</span>
          </div>
        </div>`
        )
        .join("")}
    </div>

    <div class="btn-row"><button class="btn" id="mAdd">Add to playlist</button></div>
    <div style="margin-top:10px"><button class="btn secondary" data-sheet-close>Cancel</button></div>
    `,
    (sheet) => {
      const url = sheet.querySelector("#mUrl");
      const name = sheet.querySelector("#mName");
      const error = sheet.querySelector("#mError");
      const btn = sheet.querySelector("#mAdd");
      setTimeout(() => url.focus(), 120);

      const submit = async () => {
        error.hidden = true;
        btn.disabled = true;
        const res = await addTrack(url.value, name.value);
        btn.disabled = false;
        if (!res.ok) {
          error.textContent = res.error;
          error.hidden = false;
          return;
        }
        closeSheet();
        // The playlist changed, so redraw whatever screen is showing it.
        window.dispatchEvent(new CustomEvent("music:changed"));
      };

      btn.addEventListener("click", submit);
      [url, name].forEach((el) =>
        el.addEventListener("keydown", (e) => e.key === "Enter" && submit())
      );
    }
  );
}

// ---------------------------------------------------------------- wiring
function scrubFromEvent(scrub, e) {
  const rect = scrub.querySelector(".scrub-track").getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  if (P.duration > 0) seekTo(ratio * P.duration);
}

function bindMusicEvents() {
  // One delegated listener covers the persistent player and the music screen,
  // so nothing needs rebinding when render() replaces the screen.
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-music]");
    if (!el) return;
    const id = el.dataset.trackId;

    switch (el.dataset.music) {
      case "toggle": e.stopPropagation(); togglePlay(); break;
      case "next": e.stopPropagation(); advance(1); break;
      case "prev": advance(-1); break;
      case "shuffle": toggleShuffle(); break;
      case "repeat": cycleRepeat(); break;
      case "add": openAddMusicSheet(); break;
      case "spotify-setup": openSpotifySheet(); break;
      case "expand": setExpanded(true); break;
      case "collapse": setExpanded(false); break;
      case "play":
        if (id === P.trackId) togglePlay();
        else playTrack(id);
        break;
      case "remove":
        removeTrack(id);
        window.dispatchEvent(new CustomEvent("music:changed"));
        break;
      case "up":
        moveTrack(id, -1);
        window.dispatchEvent(new CustomEvent("music:changed"));
        break;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && P.expanded) setExpanded(false);
    const el = e.target.closest?.("[data-music='expand']");
    if (el && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setExpanded(true);
    }
  });

  // Scrubbing — pointer capture keeps the drag alive outside the bar.
  document.addEventListener("pointerdown", (e) => {
    const scrub = e.target.closest(".js-scrub");
    if (!scrub || P.duration <= 0) return;
    scrub.setPointerCapture?.(e.pointerId);
    scrubFromEvent(scrub, e);

    const move = (ev) => scrubFromEvent(scrub, ev);
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });

  // YouTube reports position only when asked, so poll while it plays.
  setInterval(() => {
    if (!P.playing || P.kind !== "youtube" || !ytPlayer?.getCurrentTime) return;
    P.position = ytPlayer.getCurrentTime() || 0;
    P.duration = ytPlayer.getDuration?.() || 0;
    paintProgress();
    savePlayerState();
  }, 500);

  window.addEventListener("beforeunload", () => savePlayerState(true));
}

function setExpanded(on) {
  P.expanded = on && Boolean(current());
  document.body.classList.toggle("np-open", P.expanded);
  paintPlayer();
}

/** Wipe playback state — used when the user resets all their data. */
function resetPlayer() {
  stopPlayback();
  Object.assign(P, {
    trackId: null,
    kind: null,
    position: 0,
    duration: 0,
    shuffle: false,
    repeat: "off",
    error: "",
  });
  forgetPlayerState();
  setExpanded(false);
  rebuildOrder();
  paintPlayer();
}

// ---------------------------------------------------------------- init
function initMusic() {
  buildPlayerRoot();
  bindMusicEvents();

  const saved = mRead(PLAYER_KEY, {});
  P.shuffle = Boolean(saved.shuffle);
  P.repeat = ["off", "all", "one"].includes(saved.repeat) ? saved.repeat : "off";

  // Restore the track and position but never autoplay — browsers block sound
  // without a gesture, and a workout app shouldn't shout on launch either.
  const track = getPlaylist().find((t) => t.id === saved.trackId);
  if (track) {
    P.trackId = track.id;
    P.kind = track.kind;
    P.position = Number(saved.position) || 0;
  }

  rebuildOrder();
  paintPlayer();
  initSpotify(); // resolves a sign-in redirect, if we've just come back from one
}
