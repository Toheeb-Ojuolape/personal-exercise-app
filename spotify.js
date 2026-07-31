// ============================================================
// FitFour — Spotify connect + Web Playback SDK.
//
// The embed player only ever gives 30-second previews unless the listener
// already has a Spotify session in the same browser. The Web Playback SDK
// plays full tracks properly: it registers this page as a Spotify Connect
// device and streams to it.
//
// Auth is Authorization Code with PKCE, which is designed for exactly this —
// a public client with no server. There is no client secret anywhere in here,
// and there must never be one: this file ships to the browser.
//
// Setup, once:
//   1. developer.spotify.com/dashboard → Create app
//   2. Add this page's URL as a Redirect URI (spotifyRedirectUri() below
//      prints the exact string to paste)
//   3. Copy the Client ID into FitFour → Music → Connect Spotify
//
// Playback needs Spotify Premium. That is Spotify's rule for the SDK, not
// something the app can route around.
// ============================================================

const SP_CLIENT_KEY = "fitfour.spotify.client";
const SP_TOKEN_KEY = "fitfour.spotify.token";
const SP_VERIFIER_KEY = "fitfour.spotify.verifier";
const SP_STATE_KEY = "fitfour.spotify.state";

// Drop a Client ID here to bake one in; otherwise it's set from the UI.
const SPOTIFY_CLIENT_ID = "";

const SP_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

const spRead = (k, f = null) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? f; }
  catch { return f; }
};
const spWrite = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
};
const spDrop = (k) => {
  try { localStorage.removeItem(k); } catch {}
};

const spotifyClientId = () => spRead(SP_CLIENT_KEY, "") || SPOTIFY_CLIENT_ID;
const setSpotifyClientId = (id) => spWrite(SP_CLIENT_KEY, String(id || "").trim());
const spotifyConfigured = () => Boolean(spotifyClientId());

/** The exact string that has to be registered as a Redirect URI. */
const spotifyRedirectUri = () => location.origin + location.pathname;

// ---------------------------------------------------------------- PKCE
function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => chars[b % chars.length]).join("");
}

const base64url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}

// ---------------------------------------------------------------- tokens
const spotifyToken = () => spRead(SP_TOKEN_KEY, null);
const spotifyConnected = () => Boolean(spotifyToken()?.refresh_token);

function storeToken(data) {
  const prev = spotifyToken();
  spWrite(SP_TOKEN_KEY, {
    access_token: data.access_token,
    // A refresh response may omit the refresh token, meaning "keep the old one".
    refresh_token: data.refresh_token || prev?.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000 - 60_000,
  });
}

function spotifyLogout() {
  [SP_TOKEN_KEY, SP_VERIFIER_KEY, SP_STATE_KEY].forEach(spDrop);
  spPlayer?.disconnect?.();
  spPlayer = null;
  spDevice = null;
  spSdk = null;
}

/** Kick off the redirect to Spotify's consent screen. */
async function spotifyLogin() {
  if (!spotifyConfigured()) throw new Error("Add your Spotify Client ID first.");

  const verifier = randomString();
  const state = randomString(16);
  spWrite(SP_VERIFIER_KEY, verifier);
  spWrite(SP_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: spotifyClientId(),
    response_type: "code",
    redirect_uri: spotifyRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
    scope: SP_SCOPES,
    state,
  });
  location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchange(body) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: spotifyClientId(), ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || "Spotify rejected that sign-in.");
  storeToken(data);
  return data;
}

/**
 * Complete the round trip if Spotify just sent us back. Returns a result the
 * caller can surface, and always cleans the code out of the address bar.
 */
async function spotifyHandleRedirect() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  if (!code && !error) return null;

  const clean = () => {
    ["code", "state", "error"].forEach((k) => url.searchParams.delete(k));
    history.replaceState({}, "", url.toString());
  };

  if (error) {
    clean();
    return { ok: false, error: error === "access_denied" ? "Spotify sign-in was cancelled." : error };
  }

  const verifier = spRead(SP_VERIFIER_KEY, "");
  const expected = spRead(SP_STATE_KEY, "");
  clean();

  if (!verifier || (expected && state !== expected)) {
    return { ok: false, error: "That sign-in didn't match this device. Try connecting again." };
  }

  try {
    await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: spotifyRedirectUri(),
      code_verifier: verifier,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    [SP_VERIFIER_KEY, SP_STATE_KEY].forEach(spDrop);
  }
}

/** A live access token, refreshed when it's close to expiring. */
async function spotifyAccessToken() {
  const token = spotifyToken();
  if (!token?.refresh_token) return null;
  if (token.access_token && Date.now() < token.expires_at) return token.access_token;

  try {
    const data = await exchange({ grant_type: "refresh_token", refresh_token: token.refresh_token });
    return data.access_token;
  } catch {
    spotifyLogout(); // the grant was revoked — make the UI offer a reconnect
    return null;
  }
}

async function spotifyApi(path, options = {}) {
  const token = await spotifyAccessToken();
  if (!token) throw new Error("Connect Spotify first.");

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Spotify request failed (${res.status}).`);
  return data;
}

const spotifyMe = () => spotifyApi("/me");

// ---------------------------------------------------------------- SDK
let spSdk = null;
let spPlayer = null;
let spDevice = null;
let spStateCb = null;

const onSpotifyPlayerState = (cb) => (spStateCb = cb);

function loadSpotifySdkScript() {
  if (window.__spSdkScript) return window.__spSdkScript;
  window.__spSdkScript = new Promise((resolve, reject) => {
    if (window.Spotify?.Player) return resolve();
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    s.onerror = () => reject(new Error("Spotify's player script couldn't load."));
    document.head.appendChild(s);
  });
  return window.__spSdkScript;
}

/** Connect this page as a Spotify Connect device. Resolves once it's ready. */
function spotifySdk() {
  if (spSdk) return spSdk;

  spSdk = (async () => {
    const token = await spotifyAccessToken();
    if (!token) throw new Error("Connect Spotify first.");
    await loadSpotifySdkScript();

    return new Promise((resolve, reject) => {
      const player = new Spotify.Player({
        name: "FitFour",
        volume: 0.8,
        getOAuthToken: (cb) => spotifyAccessToken().then((t) => t && cb(t)),
      });

      player.addListener("ready", ({ device_id }) => {
        spPlayer = player;
        spDevice = device_id;
        resolve({ player, deviceId: device_id });
      });
      player.addListener("not_ready", () => (spDevice = null));
      player.addListener("player_state_changed", (state) => state && spStateCb?.(state));

      player.addListener("account_error", () =>
        reject(new Error("In-app playback needs Spotify Premium."))
      );
      player.addListener("authentication_error", () => {
        spotifyLogout();
        reject(new Error("Spotify sign-in expired — connect again."));
      });
      player.addListener("initialization_error", ({ message }) =>
        reject(new Error(message || "Spotify's player couldn't start in this browser."))
      );

      player.connect();
      setTimeout(() => reject(new Error("Spotify's player took too long to start.")), 20_000);
    });
  })().catch((err) => {
    spSdk = null; // let the next attempt retry cleanly
    throw err;
  });

  return spSdk;
}

/**
 * Start a URI on our own device. Albums, playlists and shows are contexts;
 * a single track is a uri list.
 */
async function spotifyPlayUri(uri, positionMs = 0) {
  const { player, deviceId } = await spotifySdk();

  // Safari on iOS only lets audio start from inside a gesture, and this call
  // is what hands the SDK's element that permission.
  try { await player.activateElement?.(); } catch {}

  const isContext = /^spotify:(album|playlist|artist|show):/.test(uri);
  const body = isContext ? { context_uri: uri } : { uris: [uri] };
  if (positionMs > 0) body.position_ms = Math.round(positionMs);

  await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

const spotifyResume = () => spPlayer?.resume();
const spotifyPause = () => spPlayer?.pause();
const spotifySeek = (ms) => spPlayer?.seek(Math.max(0, Math.round(ms)));
const spotifyNext = () => spPlayer?.nextTrack();
const spotifyPrevious = () => spPlayer?.previousTrack();
const spotifySdkLive = () => Boolean(spPlayer && spDevice);
