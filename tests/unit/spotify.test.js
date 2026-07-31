// spotify.js ships to the browser, so the most important assertion here is a
// negative one: there must never be a client secret in it. PKCE exists so a
// public client doesn't need one, and a secret committed to a static site is
// readable by anyone who opens devtools.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, readSource } = require("../helpers/sandbox");

const app = loadApp({ href: "https://fitfour.example/app/index.html" });
const {
  spotifyClientId, setSpotifyClientId, spotifyConfigured, spotifyConnected,
  spotifyRedirectUri, spotifyLogout, SP_SCOPES,
} = app;

const source = readSource("spotify.js");

test.describe("no credentials in the bundle", () => {
  test("carries no client secret", () => {
    assert.doesNotMatch(source, /client_secret/i, "a client secret must never appear in a file served to browsers");
  });

  test("never requests the implicit or client-credentials grant", () => {
    assert.doesNotMatch(source, /response_type=token|grant_type:\s*["']client_credentials/i);
  });

  test("uses PKCE with S256, not plain", () => {
    assert.match(source, /code_challenge_method:\s*["']S256["']/);
    assert.match(source, /SHA-256/);
  });

  test("ships without a hard-coded client id, so nobody inherits someone else's app", () => {
    assert.match(source, /const SPOTIFY_CLIENT_ID = ""/);
  });
});

test.describe("configuration", () => {
  test("starts unconfigured and unconnected", () => {
    assert.equal(spotifyConfigured(), false);
    assert.equal(spotifyConnected(), false);
  });

  test("stores and trims a client id", () => {
    setSpotifyClientId("  abc123  ");
    assert.equal(spotifyClientId(), "abc123");
    assert.equal(spotifyConfigured(), true);
  });

  test("clearing the id unconfigures it again", () => {
    setSpotifyClientId("");
    assert.equal(spotifyConfigured(), false);
  });
});

test.describe("redirect URI", () => {
  test("matches the page's own origin and path, with no query or hash", () => {
    const uri = spotifyRedirectUri();
    assert.equal(uri, "https://fitfour.example/app/index.html");
    assert.doesNotMatch(uri, /[?#]/, "Spotify matches redirect URIs exactly");
  });
});

test.describe("scopes", () => {
  test("asks for streaming and nothing beyond playback", () => {
    const scopes = SP_SCOPES.split(" ");
    assert.ok(scopes.includes("streaming"), "the Web Playback SDK needs the streaming scope");
    for (const scope of scopes) {
      assert.match(scope, /^(streaming|user-read-(email|private|playback-state)|user-modify-playback-state)$/,
        `unexpected scope requested: ${scope} — keep the ask minimal`);
    }
  });
});

test.describe("logout", () => {
  test("forgets the token but keeps the client id", () => {
    setSpotifyClientId("keep-me");
    app.localStorage.setItem("fitfour.spotify.token", JSON.stringify({ refresh_token: "r", access_token: "a", expires_at: Date.now() + 1e6 }));
    assert.equal(spotifyConnected(), true);

    spotifyLogout();
    assert.equal(spotifyConnected(), false, "the token should be gone");
    assert.equal(spotifyClientId(), "keep-me", "the app registration shouldn't need redoing");
  });
});
