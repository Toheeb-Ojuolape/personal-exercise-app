// Playwright is a dev-only, optional dependency: the unit suite runs with no
// packages installed at all, and the integration suite skips itself with
// instructions rather than failing when Playwright isn't there.

const fs = require("node:fs");

// A system Chrome is a fine fallback when Playwright's own browsers haven't
// been downloaded — one fewer 150MB step between cloning and running tests.
const SYSTEM_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    try {
      return require("playwright-core");
    } catch {
      return null;
    }
  }
}

const SKIP_MESSAGE =
  "Playwright not installed — run `npm i -D playwright && npx playwright install chromium` to run the integration suite.";

const ARGS = ["--autoplay-policy=no-user-gesture-required", "--mute-audio"];

/**
 * Resolves { browser } or { skip } so a spec can bail out cleanly.
 * `--autoplay-policy` lets the audio tests start playback without a click,
 * which is a browser-launch concern rather than something the app relies on.
 *
 * Pass `codecs: true` for anything that plays YouTube. Playwright's bundled
 * Chromium is built without the proprietary codecs (H.264/AAC) that YouTube
 * streams, so those specs need a real Google Chrome or they hang until they
 * time out — which looks like an app bug and isn't one.
 */
async function launchBrowser({ codecs = false } = {}) {
  const pw = loadPlaywright();
  if (!pw) return { skip: SKIP_MESSAGE };

  const attempts = codecs
    ? [{ channel: "chrome" }, ...systemPaths().map((executablePath) => ({ executablePath }))]
    : [{}, ...systemPaths().map((executablePath) => ({ executablePath }))];

  let last = "";
  for (const options of attempts) {
    try {
      return { browser: await pw.chromium.launch({ args: ARGS, ...options }) };
    } catch (err) {
      last = err.message.split("\n")[0];
    }
  }

  return {
    skip: codecs
      ? `Needs a Google Chrome with proprietary codecs for YouTube playback — install one, or set FITFOUR_SKIP_NETWORK=1. (${last})`
      : `${SKIP_MESSAGE} (${last})`,
  };
}

const systemPaths = () => SYSTEM_CHROME.filter((p) => fs.existsSync(p));

const skipNetwork = () => process.env.FITFOUR_SKIP_NETWORK === "1";

/** Fail loudly on page errors — a silent exception is how UI bugs hide. */
function watchForErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message)));
  page.on("console", (msg) => {
    const text = msg.text();
    // Third-party embeds are noisy about cookies, tracking and their own
    // network; only our own failures are interesting here.
    const theirs = /youtube|spotify|soundcloud|sdk\.scdn|favicon|ERR_|Failed to load resource|net::/i;
    if (msg.type() === "error" && !theirs.test(text)) errors.push(text);
  });
  return errors;
}

module.exports = { launchBrowser, watchForErrors, skipNetwork, SKIP_MESSAGE };
