// Playback in a real browser. The audio-element path uses a WAV the test
// server generates, so it needs no network. The specs that exercise YouTube
// and SoundCloud do, and are skipped with FITFOUR_SKIP_NETWORK=1.

const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("../helpers/server");
const { launchBrowser, watchForErrors, skipNetwork } = require("../helpers/browser");

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

const track = (over = {}) => ({
  id: "t1", kind: "audio", src: "/test-audio.wav", url: "/test-audio.wav",
  art: null, title: "Test Tone", subtitle: "Audio link", named: true, addedAt: 1, ...over,
});

/** Open the Music tab with a seeded playlist. */
async function openMusic(playlist = []) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errors = watchForErrors(page);
  await page.goto(`${server.origin}/index.html`, { waitUntil: "domcontentloaded" });
  if (playlist.length) {
    await page.evaluate((list) => localStorage.setItem("fitfour.playlist", JSON.stringify(list)), playlist);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForSelector(".tabbar .tab");
  await page.click('[data-tab="music"]');
  await page.waitForSelector(".large-title");
  return { page, errors };
}

// A local WAV starts near-instantly; a third-party embed has to fetch its API,
// build a player and buffer first, so those callers pass a longer budget.
const waitForPlaying = (page, timeout = 15000) =>
  page.waitForFunction(() => P?.playing === true, null, { timeout });

test.describe("the empty state", () => {
  test("offers to add a track and hides the player", async (t) => {
    if (skip) return t.skip(skip);
    const { page, errors } = await openMusic();
    assert.ok(await page.locator('[data-music="add"]').first().isVisible());
    assert.equal(await page.locator("#playerRoot").isVisible(), false, "no player until there's a track");
    assert.deepEqual(errors, []);
    await page.close();
  });
});

test.describe("audio playback", () => {
  test("plays, advances position and shows the mini bar off-tab", async (t) => {
    if (skip) return t.skip(skip);
    const { page, errors } = await openMusic([track()]);

    await page.locator('.track-main[data-music="play"]').first().click();
    await waitForPlaying(page);
    await page.waitForFunction(() => P.position > 0.2, null, { timeout: 10000 });

    const state = await page.evaluate(() => ({ kind: P.kind, duration: Math.round(P.duration), error: P.error }));
    assert.equal(state.kind, "audio");
    assert.equal(state.duration, 2, "the generated tone is two seconds long");
    assert.equal(state.error, "");

    // The mini bar is for other screens; on the Music tab the full card shows.
    assert.equal(await page.locator(".mini").isVisible(), false);
    await page.click('[data-tab="today"]');
    await page.waitForTimeout(300);
    assert.ok(await page.locator(".mini").isVisible(), "the mini bar should appear once you leave Music");
    assert.equal(await page.locator(".mini-title").textContent(), "Test Tone");
    assert.deepEqual(errors, []);
    await page.close();
  });

  test("keeps playing while you open a workout", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic([track({ src: "/test-audio.wav" })]);
    await page.evaluate(() => { P.repeat = "all"; }); // outlast the short tone
    await page.locator('.track-main[data-music="play"]').first().click();
    await waitForPlaying(page);

    await page.click('[data-tab="today"]');
    await page.waitForSelector(".week-day.tappable");
    await page.locator(".week-day.tappable").first().click();
    await page.waitForSelector(".ex-thumb");

    assert.equal(await page.evaluate(() => P.playing), true, "navigation must not stop the music");
    await page.close();
  });

  test("pauses and resumes from the mini bar", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic([track()]);
    await page.evaluate(() => { P.repeat = "all"; });
    await page.locator('.track-main[data-music="play"]').first().click();
    await waitForPlaying(page);

    await page.locator('.np-card [data-music="toggle"]').click();
    await page.waitForFunction(() => P.playing === false, null, { timeout: 8000 });
    await page.locator('.np-card [data-music="toggle"]').click();
    await waitForPlaying(page);
    await page.close();
  });

  test("remembers the track and position across a reload", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic([track()]);
    await page.evaluate(() => { P.repeat = "all"; });
    await page.locator('.track-main[data-music="play"]').first().click();
    await waitForPlaying(page);
    await page.waitForFunction(() => P.position > 0.5, null, { timeout: 8000 });
    await page.evaluate(() => savePlayerState(true));

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tabbar .tab");
    const restored = await page.evaluate(() => ({ id: P.trackId, pos: P.position, playing: P.playing }));
    assert.equal(restored.id, "t1");
    assert.ok(restored.pos > 0, "the resume point should come back");
    assert.equal(restored.playing, false, "a reload must never autoplay");
    await page.close();
  });

  test("advances to the next track when one ends", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic([track(), track({ id: "t2", title: "Second Tone" })]);
    await page.locator('.track-main[data-music="play"]').first().click();
    await waitForPlaying(page);
    await page.waitForFunction(() => P.trackId === "t2", null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => current().title), "Second Tone");
    await page.close();
  });

  test("removing the playing track stops it and clears the resume point", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic([track()]);
    await page.evaluate(() => { P.repeat = "all"; });
    await page.locator('.track-main[data-music="play"]').first().click();
    await waitForPlaying(page);

    await page.locator('[data-music="remove"]').first().click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      playing: P.playing, id: P.trackId, len: getPlaylist().length,
      saved: localStorage.getItem("fitfour.player"),
    }));
    assert.equal(after.len, 0);
    assert.equal(after.playing, false);
    assert.equal(after.id, null);
    assert.equal(after.saved, null, "a removed track must not stay as the resume point");
    await page.close();
  });
});

test.describe("adding tracks", () => {
  test("rejects a link that isn't one", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic();
    await page.click('[data-music="add"]');
    await page.waitForSelector("#mUrl");
    await page.fill("#mUrl", "not a link at all");
    await page.click("#mAdd");
    await page.waitForTimeout(300);

    assert.ok(await page.locator("#mError").isVisible(), "an error should show");
    assert.equal(await page.evaluate(() => getPlaylist().length), 0, "nothing should be added");
    await page.close();
  });

  test("refuses the same link twice", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic([track({ url: "https://cdn.example.com/a.mp3" })]);
    await page.click('[data-music="add"]');
    await page.waitForSelector("#mUrl");
    await page.fill("#mUrl", "https://cdn.example.com/a.mp3");
    await page.click("#mAdd");
    await page.waitForTimeout(400);

    assert.ok(await page.locator("#mError").isVisible());
    assert.equal(await page.evaluate(() => getPlaylist().length), 1);
    await page.close();
  });
});

test.describe("Spotify setup", () => {
  test("shows the exact redirect URI to register", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic([track()]);
    await page.click('[data-music="spotify-setup"]');
    await page.waitForSelector("#spCopyUri");

    const shown = (await page.locator("#spCopyUri .mono").textContent()).trim();
    const expected = await page.evaluate(() => spotifyRedirectUri());
    assert.equal(shown, expected);
    assert.equal(shown, `${server.origin}/index.html`);
    await page.close();
  });

  test("won't start a sign-in without a client id", async (t) => {
    if (skip) return t.skip(skip);
    const { page } = await openMusic([track()]);
    await page.click('[data-music="spotify-setup"]');
    await page.waitForSelector("#spConnect");
    await page.click("#spConnect");
    await page.waitForTimeout(300);

    assert.ok(await page.locator("#spError").isVisible());
    assert.match(page.url(), /index\.html$/, "it must not navigate anywhere");
    await page.close();
  });
});

// --- these reach the real platforms -----------------------------------------
// They run in their own browser: YouTube streams H.264/AAC, which Playwright's
// bundled Chromium can't decode, so a real Chrome is required here.
test.describe("platform playback", { skip: skipNetwork() && "FITFOUR_SKIP_NETWORK=1" }, () => {
  let ytBrowser;
  let ytSkip = false;

  test.before(async () => {
    const launched = await launchBrowser({ codecs: true });
    if (launched.skip) ytSkip = launched.skip;
    else ytBrowser = launched.browser;
  });

  test.after(async () => {
    await ytBrowser?.close();
  });

  async function openWith(playlist) {
    const page = await ytBrowser.newPage({ viewport: { width: 430, height: 900 } });
    await page.goto(`${server.origin}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((list) => localStorage.setItem("fitfour.playlist", JSON.stringify(list)), playlist);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tabbar .tab");
    await page.click('[data-tab="music"]');
    await page.waitForSelector(".large-title");
    return page;
  }

  const yt = (id, title) => ({
    id: `y-${id}`, kind: "youtube", videoId: id, listId: null,
    url: `https://www.youtube.com/watch?v=${id}`, art: null,
    title, subtitle: "YouTube", named: true, addedAt: 1,
  });

  test("plays a YouTube video and skips to the next track", async (t) => {
    if (ytSkip) return t.skip(ytSkip);
    const page = await openWith([yt("dQw4w9WgXcQ", "First"), yt("kJQP7kiw5Fk", "Second")]);
    await page.locator('.track-main[data-music="play"]').first().click();
    await waitForPlaying(page, 45000);
    await page.waitForFunction(() => P.duration > 0, null, { timeout: 20000 });

    // Next used to be a silent no-op on links carrying a radio-mix list id.
    await page.evaluate(() => advance(1));
    await page.waitForFunction(() => P.trackId === "y-kJQP7kiw5Fk", null, { timeout: 20000 });
    await page.close();
  });

  test("flags a video that can't be embedded and moves on", async (t) => {
    if (ytSkip) return t.skip(ytSkip);
    const page = await openWith([yt("zzzzzzzzzzz", "Blocked"), yt("dQw4w9WgXcQ", "Playable")]);
    await page.locator('.track-main[data-music="play"]').first().click();

    await page.waitForFunction(
      () => getPlaylist().find((t) => t.id === "y-zzzzzzzzzzz")?.blocked,
      null,
      { timeout: 30000 }
    );
    await page.waitForFunction(() => P.trackId === "y-dQw4w9WgXcQ", null, { timeout: 30000 });

    const flags = await page.evaluate(() => getPlaylist().map((t) => Boolean(t.blocked)));
    assert.deepEqual(flags, [true, false], "only the blocked track should be flagged");
    assert.ok(await page.locator(".src-chip.warn").first().isVisible(), "the row should say so");
    await page.close();
  });

  test("checks embeddability when a link is added, not mid-workout", async (t) => {
    if (ytSkip) return t.skip(ytSkip);
    const page = await openWith([]);
    await page.click('[data-music="add"]');
    await page.waitForSelector("#mUrl");
    await page.fill("#mUrl", "https://www.youtube.com/watch?v=zzzzzzzzzzz");
    await page.click("#mAdd");

    await page.waitForFunction(() => getPlaylist()[0]?.blocked, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => P.playing), false, "the probe must never start playback");
    await page.close();
  });
});
