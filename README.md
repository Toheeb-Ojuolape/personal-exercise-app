# FitFour

A mobile-first web app for losing fat and building muscle — eight muscle-group
categories (Chest, Back, Shoulders, Arms, Legs, Glutes & Hamstrings, Core,
Conditioning) of four exercises each, with a form video for every exercise,
personalised calorie and protein targets, a built-in music player, and progress
tracking.

Built as a static site: no build step, no framework, no backend. It deploys to
Netlify in about a minute and works offline-ish once loaded (only the videos
need the network).

## Features

- **Today** — the session scheduled for today, your week at a glance, streak,
  and daily macro targets. Rest days get their own state. **Every scheduled day
  in the week strip is a shortcut straight into that day's workout.**
- **Plan** — all eight categories, colour-coded, showing which weekday each one
  falls on this week and its completion state.
- **Training days** — pick whichever days you'll actually be in the gym,
  weekends included. Categories are dealt out in order across your chosen days,
  with a live preview of what lands where. Defaults to Mon/Tue/Thu/Fri.
- **Weekly rotation** — the deal shifts forward each week, so four training days
  still work through all eight categories every fortnight instead of repeating
  the same four. Toggle it off under Training days to keep a fixed week.
- **Music** — paste a link from YouTube, YouTube Music, Spotify, SoundCloud, or
  any direct `.mp3` and it plays inside the app: mini bar above the tab bar, a
  full now-playing panel, shuffle, repeat, and a scrubber. Titles and artwork
  are fetched from each platform's oEmbed endpoint. Connect a Spotify Premium
  account for full-track playback. Tracks a platform refuses to play in an
  embed are flagged and skipped rather than stalling the queue. See
  [Music and background playback](#music-and-background-playback).
- **Workout screen** — tick exercises off as you go, tap the thumbnail to watch
  a form video in a player sheet, tap a rest chip to start a countdown timer.
  Closing the sheet (or tapping Done) unloads the video so it stops immediately;
  your music keeps playing.
- **Progress** — body-weight chart, weigh-in history with deltas, session log.
- **Profile photo** — tap the avatar to upload one. It's center-cropped and
  downscaled to a 256px JPEG before storage (a 6MB camera photo lands at
  ~20KB), because `localStorage` only holds about 5MB of string data. Falls
  back to your initials. It also appears in the app bar on every tab as a
  shortcut into Profile.
- **Profile** — local account with name, age, height, weight, and goal weight.
  Calculates maintenance calories (Mifflin-St Jeor), a fat-loss target, and
  protein/fat/carb splits. Metric or imperial. Export or wipe your data.
- **Light and dark mode** — follows your system by default, with a manual
  toggle that sticks.
- **Colour themes** — six presets (Violet, Ocean, Sunset, Forest, Crimson,
  Slate) plus a custom option where you pick a primary and secondary colour.
  The theme drives the brand colour, the brand gradient, and all eight category
  accents — resampled from each preset's anchors and separated in hue and
  lightness so neighbouring categories never look alike; changes apply live. Success green and error red stay fixed so
  meaning never shifts.
- **Installable, offline-capable PWA** — a service worker precaches the whole
  app shell, so it opens and works with no connection: browsing the plan,
  ticking exercises, rest timers, weigh-ins and the full history. Only form
  videos and streamed music need the network. Install from Profile → **App**,
  or your browser's own menu. Home-screen shortcuts jump straight to Today,
  Music, or Progress.
- **Reminders** — set the time you plan to train, then pick as many lead times
  as you want (2 hours, 1 hour, 30/15/10/5 min, at start) exactly like a
  calendar invite. Each one is its own alert. Plus a ping when a rest timer
  runs out while you're in another app. See
  [Reminders](#reminders-and-what-they-can-actually-do).
- **Home screen** — a badge on the installed app icon while today's session is
  still outstanding, and a Windows 11 widget. See [Widgets](#widgets-and-the-home-screen).
- **Motion** — directional screen transitions (slide in when you open a
  workout, slide back when you leave, cross-fade between tabs), a tab bar with
  a sliding indicator and icon pop, and pressed states throughout. All of it
  respects `prefers-reduced-motion`.

All data lives in `localStorage` on the device. Nothing is uploaded anywhere.

## Tests

```bash
npm test              # unit — needs no packages installed at all
npm run test:integration   # drives the real app in a browser
npm run test:all
```

**Unit** specs run on Node's built-in test runner. `tests/helpers/sandbox.js`
evaluates the app's scripts the way a browser would — one shared global scope,
same order as `index.html` — against a small DOM stub, so the source files stay
buildless and unmodified. They cover link parsing, the schedule rotation, the
palette maths, the macro calculations, and a check that no Spotify client
secret ever lands in a file that ships to browsers.

**Integration** specs drive Chromium with Playwright:
`npm i -D playwright && npx playwright install chromium`. Without it they skip
themselves with that instruction rather than failing. The audio-playback specs
are hermetic — the test server generates a two-second WAV — while the YouTube
specs need the network and a real Google Chrome, since Playwright's bundled
Chromium ships without the proprietary codecs YouTube streams. Set
`FITFOUR_SKIP_NETWORK=1` to skip those.

Two things in the test setup are load-bearing and easy to "tidy" into
breakage, so both are commented where they live: the server must be addressed
as `localhost` (YouTube's embed rejects a `127.0.0.1` origin with error 150),
and values returned from the sandbox carry that context's prototypes, so deep
comparisons need a spread first.

## Run locally

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Deploy to Netlify

**Drag and drop** — go to https://app.netlify.com/drop and drop the
`exercise-app` folder on the page. Done.

**CLI**
```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

**From a Git repo** — point Netlify at the repo, leave the build command
blank, set the publish directory to `.`. `netlify.toml` already covers this.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell — app bar, screen container, tab bar, sheet host |
| `style.css` | Design tokens, both themes, and every component |
| `workouts.js` | The eight categories and nutrition tips — **edit this to customise** |
| `palette.js` | Colour presets, HSL maths for custom themes, CSS-var application |
| `profile.js` | Profile storage, unit conversion, BMR/TDEE/macro math |
| `icons.js` | Inline SVG icon set |
| `music.js` | Playlist storage, link parsing, the player, and its persistent UI |
| `spotify.js` | Spotify PKCE sign-in and Web Playback SDK wrapper |
| `notify.js` | Service worker registration, install prompt, reminder scheduling |
| `sw.js` | Offline shell cache, update flow, background reminders |
| `tools/make-icons.js` | Regenerates `icons/` from the app artwork (dev only) |
| `app.js` | Router, screens, sheets, rest timer |
| `manifest.json`, `icon.svg`, `icons/` | Install metadata and icon set |
| `tests/` | Unit and integration specs — dev only, never deployed |
| `package.json` | Test scripts and the optional Playwright dev dependency |

## Customising

**The program** — edit the `WORKOUTS` array in `workouts.js`. Each category has
an `accent` colour, an `iconName` pointing at a glyph in `icons.js`, and a
`short` label used as the icon's tooltip and accessible name. Each exercise
needs a `videoId`: the 11-character ID from a YouTube URL
(`youtube.com/watch?v=<videoId>`). Add or remove categories freely — the
schedule, the palette, and every screen size themselves off `WORKOUTS.length`.
If you add a ninth, raise `DAY_ACCENTS` in `palette.js` to match.

**The schedule** — change it in the app: Plan or Profile → **Training days**.
It's stored per user in `profile.trainingDays` as weekday numbers
(0 = Sunday). To move the out-of-the-box default, edit
`DEFAULT_TRAINING_DAYS` in `profile.js`. `schedule(date)` in `app.js` derives
the weekday → category mapping for the week containing `date`, offsetting the
deal by `weekIndex(date) * trainingDays` so the rotation advances weekly.

**The targets** — `nutritionTargets()` in `profile.js` uses a 450 kcal deficit,
1.8 g/kg protein, and 25% of calories from fat. Adjust to taste.

**The colours** — add an entry to `PALETTES` in `palette.js`. Each preset needs
a `brandDark`/`brandLight` pair (light mode needs a darker brand for contrast),
a 2- or 3-stop `grad`, and four `days` anchor accents — `expandDays()`
resamples those up to one per category. Everything is applied as CSS custom
properties on `:root`, so components stay palette-agnostic.

## Exercise videos

Every exercise links a real YouTube tutorial from an established
strength-coaching channel — Jeff Nippard, ATHLEAN-X, Renaissance
Periodization, NASM, Buff Dudes, Jeremy Ethier and similar. Each video ID was
verified against YouTube's oEmbed API rather than guessed. Videos load only
when you open one, so the workout list stays fast.

## Reminders, and what they can actually do

Notifications are opt-in under Profile → **App** → Workout reminders.

| | |
|---|---|
| **Works reliably** | A reminder while FitFour is in the background. A rest-timer ping after you've switched apps. Both go through the service worker, so they survive the page being backgrounded. |
| **Best effort** | A reminder with every tab closed. Chrome can wake an installed PWA through Periodic Background Sync, so it's wired up — but the browser decides whether and when it runs, and Safari has no equivalent. |
| **Not possible here** | A guaranteed alert at an exact time with the app closed. That needs Web Push, which needs a server holding VAPID keys. This app has no backend by design. |

Lead times work like a calendar invite: one **gym time**, and any number of
alerts before it. Each lead time fires once per day and is tracked separately,
so the 30-minute warning going out never silences the one at the start. Each
gets its own notification tag, or the second would silently replace the first.

Two deliberate behaviours:

- **It stays quiet while you're looking at the app.** A nudge is for reaching
  you elsewhere; if FitFour is on screen, today's session is already in front
  of you. It also isn't marked as delivered in that case, so it can still fire
  once you leave.
- **It never nudges twice in a day**, and never on a rest day or after you've
  finished the session.

Because a service worker can't read `localStorage`, the page mirrors a small
plan (enabled, gym time, lead times, which have already fired, training days,
whether today is done, plus week stats for the widget) into Cache Storage under
`fitfour-plan`. That's the only way a background wake-up — or the widget — can
know what's going on. A background wake-up sends only the most urgent lead time
that's genuinely due, since firing a backlog of three at once would be worse
than sending nothing.

## Widgets and the home screen

Worth being blunt about what's possible, because "widget" means different
things per platform:

| Platform | What you get |
|---|---|
| **Android / iOS** | **No home-screen widget is possible for a web app** — those need `AppWidgetProvider` or WidgetKit in a native app. What you do get: the installed icon, long-press **shortcuts** into Today/Music/Progress, and a **badge** on the icon while today's session is outstanding. |
| **Windows 11** | A real widget in the Widgets Board, declared with the manifest `widgets` member and rendered from an Adaptive Card. Shows today's session, weekly count and streak, with a button that opens the app. |
| **macOS / desktop** | The dock or taskbar icon carries the same badge. |

The badge uses the Badging API and is best-effort: unsupported browsers and
uninstalled tabs simply ignore it, and nothing else depends on it.

The Windows widget lives in `widgets/`: `today-template.json` is the Adaptive
Card, `today-data.json` is the placeholder shown before the app has ever run.
`sw.js` handles `widgetinstall`, `widgetresume` and `widgetclick`, filling the
card from the mirrored plan. Unknown manifest members are ignored everywhere
else, so none of this affects installability on other platforms.

## Offline and updates

`sw.js` precaches the shell and serves it cache-first, revalidating in the
background. Navigations try the network first and fall back to the cached page,
so a deploy lands promptly but a dead connection still opens the app.
Cross-origin requests are never intercepted — caching a YouTube or Spotify
media stream would break playback and fill up storage.

**When you change a file, bump `VERSION` in `sw.js`.** There's no build step to
hash filenames, so that constant is what tells an installed copy its cache is
stale. When a new worker is waiting, the app shows a "new version is ready" bar
rather than reloading underneath you.

Icons are generated from the same artwork as `icon.svg`:

```bash
node tools/make-icons.js
```

That writes `icons/` at the sizes Chrome's install criteria require, plus a
maskable variant drawn full-bleed with the mark inside the 80% safe zone (a
rounded-square icon gets its corners clipped by Android launchers) and a
monochrome badge for the notification status bar.

## Music and background playback

Paste a link on the **Music** tab and FitFour works out what it is:

| Source | What's supported |
|---|---|
| YouTube / YouTube Music | `youtube.com`, `music.youtube.com`, `youtu.be`, `/shorts`, `/embed`, and playlist links. Played through the YouTube IFrame API, so skip, seek and scrub all work; playlist links navigate inside the playlist. A `list=` param on a *watch* link is ignored on purpose — YouTube Music appends an endless radio mix to every share link. |
| Spotify | Tracks, albums, playlists, episodes, and `spotify:` URIs. **Connect an account** (below) for full tracks via the Web Playback SDK. Without connecting, it falls back to the embed player, which is preview-only for most listeners. |
| SoundCloud | Any public track or set, via the Widget API. **No key, no account, no registration** — the widget resolves the URL itself. Sets play through with working skip. Short `on.soundcloud.com` links don't resolve; use the full URL. |
| Direct audio | Any `.mp3`, `.m4a`, `.aac`, `.ogg`, `.wav`, `.flac` URL, played by a plain `<audio>` element. |

### Connecting Spotify

Full-track playback uses the [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk), which registers the page as a Spotify Connect device. Auth is Authorization Code with PKCE, so it runs entirely in the browser — **there is no client secret in this repo and there must never be one.** Setup, once:

1. Create a free app at `developer.spotify.com/dashboard`.
2. Add this page's URL as a Redirect URI. Music → Connect Spotify shows the exact string to paste, with a tap to copy it.
3. Paste the Client ID into that same sheet. It's a public identifier — it's designed to ship in the page. To bake one in instead, set `SPOTIFY_CLIENT_ID` at the top of `spotify.js`.

Playback needs **Spotify Premium** — Spotify's rule for the SDK, not something the app can work around. On iOS, Safari won't start audio on its own, so the first play of each track needs a tap, and volume control is disabled by Apple.

### When a track won't play

Embedding is a per-track permission and plenty of rights-managed music switches it off. YouTube reports this as [error 101/150](https://developers.google.com/youtube/iframe_api_reference); SoundCloud reports nothing at all and simply never leaves 0:00 — its own play button does nothing either, so a watchdog catches that case. Either way the track is flagged **"Can't play in-app"** with a link out to the platform, and playback skips to the next one so a workout playlist doesn't die mid-set. A queue where every track is blocked stops cleanly instead of looping.

Titles and artwork come from each platform's public oEmbed endpoint; YouTube,
SoundCloud and Spotify tracks also adopt their real title, artist and artwork
from the player once playback starts.

**How far "background" actually goes.** The player lives in `#playerRoot`,
outside the `#screen` element that `render()` replaces, so audio survives every
in-app action — changing tabs, opening a workout, ticking exercises, finishing a
session, or opening a form video. It also keeps playing when the tab is in the
background, when you switch apps, and when the screen is locked, with metadata
and transport controls on the lock screen via the Media Session API.

What no web app can do is keep playing after its tab or the browser is closed —
browsers stop all audio at that point, and there is no API that overrides it.
FitFour does the next best thing: it saves the current track and position every
few seconds, so reopening it restores both and one tap resumes exactly where you
stopped. Installing it to the home screen (it's a PWA) gives the steadiest
background behaviour, since the app then owns its own window rather than sharing
a browser tab that's easy to close by accident.

## A note on fonts

The app uses the system font stack, which resolves to **SF Pro** on macOS and
iOS, Segoe UI on Windows, and Roboto on Android — the same fonts native apps
use. Nothing is downloaded, so there's no layout shift on load and no font
licensing to worry about.

---

Warm up before training and stop if you feel sharp pain. Talk to a doctor
before starting a new program, especially if you have existing conditions.
