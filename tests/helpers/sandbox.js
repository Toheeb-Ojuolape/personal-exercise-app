// Load the app's scripts into an isolated context so their logic can be
// tested in Node.
//
// The app is deliberately buildless: every file is a classic <script> that
// declares globals, with no imports or exports. Rather than bolt module
// syntax onto files that then couldn't run in the browser unchanged, this
// evaluates them exactly as a browser would — in one shared global scope, in
// the same order as index.html — against just enough of a DOM to satisfy them.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");

/** Same order as index.html, minus app.js — that one boots the UI on load. */
const APP_SCRIPTS = ["workouts.js", "icons.js", "palette.js", "profile.js", "spotify.js", "music.js"];

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(String(k)),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

/** A DOM node stub that records style properties so applyPalette is testable. */
function makeElement(tag = "div") {
  const styles = new Map();
  const attrs = new Map();
  return {
    tagName: String(tag).toUpperCase(),
    dataset: {},
    hidden: false,
    innerHTML: "",
    textContent: "",
    children: [],
    style: {
      setProperty: (k, v) => styles.set(k, String(v)),
      getPropertyValue: (k) => styles.get(k) ?? "",
      removeProperty: (k) => styles.delete(k),
    },
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    appendChild(child) { this.children.push(child); return child; },
    removeChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
}

function makeDocument() {
  const documentElement = makeElement("html");
  const head = makeElement("head");
  const body = makeElement("body");
  return {
    documentElement,
    head,
    body,
    getElementById: () => null,
    createElement: (tag) => makeElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  };
}

/**
 * Evaluate the app scripts and hand back the shared global object, so tests
 * can reach any top-level function or constant by name.
 *
 * Note for callers: objects and arrays that come *back* out of here were built
 * with this context's Object/Array prototypes, so assert.deepStrictEqual sees
 * a prototype mismatch even when the contents match. Spread them first —
 * `{ ...result }` or `[...result]` — before a deep comparison.
 */
function loadApp({ scripts = APP_SCRIPTS, href = "https://fitfour.test/" } = {}) {
  const url = new URL(href);
  const context = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Date,
    Math,
    JSON,
    Promise,
    Intl,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    crypto: webcrypto,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    document: makeDocument(),
    navigator: { vibrate() {}, clipboard: { writeText: async () => {} } },
    location: { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search },
    history: { replaceState() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    fetch: async () => { throw new Error("network is disabled in unit tests"); },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    MediaMetadata: class { constructor(init) { Object.assign(this, init); } },
    Audio: class { constructor() { this.src = ""; } addEventListener() {} play() {} pause() {} },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  };
  context.window = context;
  context.globalThis = context;
  context.self = context;

  vm.createContext(context);

  const sources = scripts.map((file) => ({
    file,
    code: fs.readFileSync(path.join(ROOT, file), "utf8"),
  }));

  for (const { file, code } of sources) {
    vm.runInContext(code, context, { filename: file });
  }

  // A top-level `const`/`let`/`class` is a lexical binding, not a property of
  // the global object, so it can't be read off the context from out here.
  // Collect the declared names and evaluate them *inside* the context — the
  // same trick a browser devtools console does when you type a name.
  const names = new Set();
  for (const { code } of sources) {
    for (const m of code.matchAll(/^(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      names.add(m[1]);
    }
  }
  const picked = vm.runInContext(`({ ${[...names].join(", ")} })`, context, {
    filename: "sandbox:exports",
  });

  return Object.assign(context, picked);
}

const readSource = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

module.exports = { loadApp, readSource, ROOT, APP_SCRIPTS };
