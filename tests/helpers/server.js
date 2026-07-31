// A static file server for the integration tests. Built on node:http so the
// suite doesn't drag in a dependency just to serve six files.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
};

/**
 * A short, valid WAV tone generated on the fly. Playing real audio in the
 * tests would otherwise mean either committing a binary or reaching out to
 * the network — this keeps the audio path hermetic and fast.
 */
function makeWav({ seconds = 2, freq = 440, rate = 8000 } = {}) {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); // PCM header size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000), 44 + i * 2);
  }
  return buffer;
}

const TONE = makeWav();

/** Start on an ephemeral port. Resolves to { origin, hits, close }. */
function startServer() {
  // Counts requests per path, so a test can tell a cache hit from a real fetch.
  const hits = new Map();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    hits.set(url.pathname, (hits.get(url.pathname) || 0) + 1);

    if (url.pathname === "/test-audio.wav") {
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": TONE.length });
      return res.end(TONE);
    }

    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.join(ROOT, rel);

    // Never serve outside the project, even in a test.
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("forbidden");
    }

    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    });
  });

  return new Promise((resolve) => {
    // Bind loopback-only, but address it as "localhost" — YouTube's embed
    // validates the page's origin and rejects http://127.0.0.1 with error 150
    // ("can't be played outside YouTube") while accepting http://localhost.
    // Swapping this for 127.0.0.1 silently breaks every YouTube spec.
    server.listen(0, "localhost", () => {
      const { port } = server.address();
      resolve({
        origin: `http://localhost:${port}`,
        hits: (pathname) => hits.get(pathname) || 0,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

module.exports = { startServer };
