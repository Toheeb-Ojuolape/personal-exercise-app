// parseTrackUrl decides which player handles a pasted link. Getting it wrong
// is silent — the track is added and then simply never plays — so every URL
// shape people actually paste is pinned down here.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers/sandbox");

const app = loadApp();
const { parseTrackUrl, SOURCES, fmtTime, prettyFilename } = app;

const kindOf = (url) => parseTrackUrl(url)?.kind ?? null;

test.describe("parseTrackUrl — YouTube", () => {
  test("handles every watch-link shape", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      const track = parseTrackUrl(url);
      assert.equal(track?.kind, "youtube", url);
      assert.equal(track.videoId, "dQw4w9WgXcQ", url);
    }
  });

  test("treats music.youtube.com as YouTube", () => {
    const track = parseTrackUrl("https://music.youtube.com/watch?v=kJQP7kiw5Fk");
    assert.equal(track.kind, "youtube");
    assert.equal(track.videoId, "kJQP7kiw5Fk");
  });

  // A YouTube Music share link carries an endless radio mix. Honouring it
  // would start a station nobody asked for, and it used to make the skip
  // button a no-op by pointing at a playlist the player never loaded.
  test("drops the radio-mix list from a watch link", () => {
    const track = parseTrackUrl(
      "https://music.youtube.com/watch?v=kJQP7kiw5Fk&list=RDAMVMkJQP7kiw5Fk&si=xyz"
    );
    assert.equal(track.videoId, "kJQP7kiw5Fk");
    assert.equal(track.listId, null, "a watch link must not become a playlist");
  });

  test("keeps the list for a real playlist link", () => {
    const track = parseTrackUrl("https://www.youtube.com/playlist?list=PLabc123");
    assert.equal(track.kind, "youtube");
    assert.equal(track.listId, "PLabc123");
    assert.equal(track.videoId, null);
  });

  test("accepts a bare video id", () => {
    assert.equal(parseTrackUrl("dQw4w9WgXcQ")?.videoId, "dQw4w9WgXcQ");
  });

  test("derives a thumbnail for single videos", () => {
    assert.match(parseTrackUrl("https://youtu.be/dQw4w9WgXcQ").art, /img\.youtube\.com/);
  });
});

test.describe("parseTrackUrl — Spotify", () => {
  test("handles links, locale prefixes and URIs", () => {
    const cases = [
      ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", "track", "4cOdK2wGLETKBW3PvgPWqT"],
      ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc", "track", "4cOdK2wGLETKBW3PvgPWqT"],
      ["https://open.spotify.com/intl-de/album/1A2B3C", "album", "1A2B3C"],
      ["https://open.spotify.com/playlist/37i9dQZF1DX", "playlist", "37i9dQZF1DX"],
      ["spotify:track:4cOdK2wGLETKBW3PvgPWqT", "track", "4cOdK2wGLETKBW3PvgPWqT"],
    ];
    for (const [url, type, id] of cases) {
      const track = parseTrackUrl(url);
      assert.equal(track?.kind, "spotify", url);
      assert.equal(track.spType, type, url);
      assert.equal(track.spId, id, url);
      assert.equal(track.uri, `spotify:${type}:${id}`, url);
    }
  });
});

test.describe("parseTrackUrl — SoundCloud", () => {
  test("accepts tracks and sets", () => {
    const track = parseTrackUrl("https://soundcloud.com/artist/some-track");
    assert.equal(track.kind, "soundcloud");
    assert.equal(track.listId, null);

    const set = parseTrackUrl("https://soundcloud.com/artist/sets/workout-mix");
    assert.equal(set.kind, "soundcloud");
    assert.equal(set.listId, "set", "a /sets/ link plays through as a playlist");
  });

  test("normalises the mobile host", () => {
    assert.equal(parseTrackUrl("https://m.soundcloud.com/artist/track").scUrl,
      "https://soundcloud.com/artist/track");
  });

  // The widget resolves full URLs only, so a short link would be added and
  // then silently never play. Better to reject it at the door.
  test("rejects unresolvable short links", () => {
    assert.equal(parseTrackUrl("https://on.soundcloud.com/abc123"), null);
  });
});

test.describe("parseTrackUrl — audio files and rejections", () => {
  test("accepts direct audio URLs", () => {
    for (const ext of ["mp3", "m4a", "aac", "ogg", "wav", "flac"]) {
      assert.equal(kindOf(`https://cdn.example.com/song.${ext}`), "audio", ext);
    }
  });

  test("names a track from its filename", () => {
    assert.equal(parseTrackUrl("https://x.example.com/my_song-final.mp3").title, "My song final");
    assert.equal(prettyFilename("/a/b/warm%20up.mp3"), "Warm up");
  });

  test("rejects anything that isn't a link", () => {
    for (const junk of ["", "   ", "hello world", "not a url", "javascript:alert(1)", "ftp://x.com/a.mp3"]) {
      assert.equal(parseTrackUrl(junk), null, JSON.stringify(junk));
    }
  });

  test("rejects a hostname with no dot", () => {
    assert.equal(parseTrackUrl("https://localhostmusic"), null);
  });
});

test.describe("source metadata", () => {
  test("every kind parseTrackUrl can return has a label, icon and tint", () => {
    const kinds = new Set([
      kindOf("https://youtu.be/dQw4w9WgXcQ"),
      kindOf("https://open.spotify.com/track/abc"),
      kindOf("https://soundcloud.com/a/b"),
      kindOf("https://x.example.com/a.mp3"),
    ]);
    assert.equal(kinds.size, 4, "expected all four sources to be reachable");
    for (const kind of kinds) {
      assert.ok(SOURCES[kind], `SOURCES is missing ${kind}`);
      assert.ok(SOURCES[kind].label && SOURCES[kind].icon && SOURCES[kind].tint, kind);
      assert.ok(app.ICON_PATHS[SOURCES[kind].icon], `no icon named ${SOURCES[kind].icon}`);
    }
  });
});

test.describe("fmtTime", () => {
  test("formats and clamps", () => {
    assert.equal(fmtTime(0), "0:00");
    assert.equal(fmtTime(9), "0:09");
    assert.equal(fmtTime(75), "1:15");
    assert.equal(fmtTime(3599), "59:59");
    assert.equal(fmtTime(-5), "0:00", "negatives clamp rather than print '-1:-5'");
    assert.equal(fmtTime(NaN), "0:00");
    assert.equal(fmtTime(Infinity), "0:00");
  });
});
