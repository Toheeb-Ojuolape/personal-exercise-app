# FitFour

A mobile-first web app for losing fat and building muscle on a 4-day gym
schedule — an upper/lower split (Push · Quads · Pull · Hinge) with a form
video for every exercise, personalised calorie and protein targets, and
progress tracking.

Built as a static site: no build step, no framework, no backend. It deploys to
Netlify in about a minute and works offline-ish once loaded (only the videos
need the network).

## Features

- **Today** — the session scheduled for today, your week at a glance, streak,
  and daily macro targets. Rest days get their own state.
- **Plan** — all four workouts, colour-coded, with completion state per week.
- **Training days** — pick whichever days you'll actually be in the gym,
  weekends included. The four workouts are dealt out in order across your
  chosen days, with a live preview of what lands where. Defaults to
  Mon/Tue/Thu/Fri.
- **Workout screen** — tick exercises off as you go, tap the thumbnail to watch
  a form video in a player sheet, tap a rest chip to start a countdown timer.
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
  The theme drives the brand colour, the brand gradient, and all four workout
  accents; changes apply live. Success green and error red stay fixed so
  meaning never shifts.
- **Installable** — add to home screen for a standalone, full-screen app.
- **Motion** — directional screen transitions (slide in when you open a
  workout, slide back when you leave, cross-fade between tabs), a tab bar with
  a sliding indicator and icon pop, and pressed states throughout. All of it
  respects `prefers-reduced-motion`.

All data lives in `localStorage` on the device. Nothing is uploaded anywhere.

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
| `workouts.js` | The 4-day program and nutrition tips — **edit this to customise** |
| `palette.js` | Colour presets, HSL maths for custom themes, CSS-var application |
| `profile.js` | Profile storage, unit conversion, BMR/TDEE/macro math |
| `icons.js` | Inline SVG icon set |
| `app.js` | Router, screens, sheets, rest timer |
| `manifest.json`, `icon.svg` | Add-to-home-screen support |

## Customising

**The program** — edit the `WORKOUTS` array in `workouts.js`. Each day has an
`accent` colour, an `iconName` pointing at a glyph in `icons.js`, and a
`short` label used as the icon's tooltip and accessible name. Each exercise
needs a `videoId`: the 11-character ID from a YouTube URL
(`youtube.com/watch?v=<videoId>`).

**The schedule** — change it in the app: Plan or Profile → **Training days**.
It's stored per user in `profile.trainingDays` as weekday numbers
(0 = Sunday). To move the out-of-the-box default, edit
`DEFAULT_TRAINING_DAYS` in `profile.js`. `schedule()` in `app.js` derives the
weekday → workout mapping, cycling the four workouts if more than four days
are selected.

**The targets** — `nutritionTargets()` in `profile.js` uses a 450 kcal deficit,
1.8 g/kg protein, and 25% of calories from fat. Adjust to taste.

**The colours** — add an entry to `PALETTES` in `palette.js`. Each preset needs
a `brandDark`/`brandLight` pair (light mode needs a darker brand for contrast),
a 2- or 3-stop `grad`, and four `days` accents. Everything is applied as CSS
custom properties on `:root`, so components stay palette-agnostic.

## Exercise videos

Every exercise links a real YouTube tutorial from an established
strength-coaching channel — Jeff Nippard, ATHLEAN-X, Renaissance
Periodization, NASM, Buff Dudes, Jeremy Ethier and similar. Each video ID was
verified against YouTube's oEmbed API rather than guessed. Videos load only
when you open one, so the workout list stays fast.

## A note on fonts

The app uses the system font stack, which resolves to **SF Pro** on macOS and
iOS, Segoe UI on Windows, and Roboto on Android — the same fonts native apps
use. Nothing is downloaded, so there's no layout shift on load and no font
licensing to worry about.

---

Warm up before training and stop if you feel sharp pain. Talk to a doctor
before starting a new program, especially if you have existing conditions.
