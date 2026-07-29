# FitFour

A simple, static 4-day-a-week gym app for losing fat and building muscle — an
Upper/Lower split (Push / Legs-Quads / Pull / Legs-Hinge) with an embedded
form-demo video for every exercise, form cues, nutrition basics, and local
progress tracking (body weight + session log, saved in the browser via
`localStorage`).

No build step, no framework, no backend — just HTML/CSS/JS, so it deploys to
Netlify in minutes.

## Run locally

Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open the printed URL in your browser.

## Deploy to Netlify

**Option A — Drag and drop (fastest, no account setup beyond Netlify login)**
1. Go to https://app.netlify.com/drop
2. Drag the entire `exercise-app` folder onto the page.
3. Netlify gives you a live URL immediately.

**Option B — Netlify CLI**
```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

**Option C — Connect a Git repo**
1. Push this folder to a GitHub/GitLab/Bitbucket repo.
2. In Netlify: "Add new site" → "Import an existing project" → pick the repo.
3. Build command: leave blank. Publish directory: `.`
4. Deploy — `netlify.toml` already sets this up.

## Structure

- `index.html` — app shell and tab navigation
- `style.css` — styling, including the click-to-play video thumbnail component
- `workouts.js` — the 4-day workout plan and nutrition tips (edit this to customize the program)
- `app.js` — rendering + progress tracking logic (localStorage only, no backend)

## Exercise videos

Each exercise embeds a real YouTube tutorial (via `videoId` in `workouts.js`),
sourced from reputable strength-coaching channels (Jeff Nippard, ATHLEAN-X,
Renaissance Periodization, NASM, Buff Dudes, and similar). Videos are
click-to-play — the page loads a lightweight thumbnail first and only embeds
the YouTube iframe once the user taps play, so the workout pages stay fast.

## Customizing the program

Edit the `WORKOUTS` array in `workouts.js`. Each exercise has a `videoId`
field — the 11-character ID from a YouTube URL
(`youtube.com/watch?v=<videoId>`) — swap it for any video you prefer.
