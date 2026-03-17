import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const app = express();
app.use(express.json());
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config file storage ───────────────────────────────────────────────────────
const DATA_PATH = join(__dirname, "../data/config.json");

function readConfig() {
  try {
    if (!existsSync(DATA_PATH)) return {};
    return JSON.parse(readFileSync(DATA_PATH, "utf8"));
  } catch { return {}; }
}

function writeConfig(data) {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

app.get("/api/config", (_req, res) => res.json(readConfig()));

app.patch("/api/config", (req, res) => {
  writeConfig({ ...readConfig(), ...req.body });
  res.json({ ok: true });
});

const YOUTRACK_URL = process.env.YOUTRACK_URL; // e.g. https://yourcompany.youtrack.cloud
const YOUTRACK_TOKEN = process.env.YOUTRACK_TOKEN; // permanent token from YouTrack profile

if (!YOUTRACK_URL || !YOUTRACK_TOKEN) {
  console.error("Missing YOUTRACK_URL or YOUTRACK_TOKEN environment variables");
  process.exit(1);
}

// ── YouTrack proxy ───────────────────────────────────────────────────────────
// All requests to /youtrack/* are forwarded to YouTrack API with auth header

app.use("/youtrack", async (req, res) => {
  const targetUrl = `${YOUTRACK_URL}${req.originalUrl.replace("/youtrack", "")}`;

  try {
    const headers = {
      "Authorization": `Bearer ${YOUTRACK_TOKEN}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    const fetchOptions = { method: req.method, headers };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      fetchOptions.body = Buffer.concat(chunks);
    }

    const ytResponse = await fetch(targetUrl, fetchOptions);
    const data = await ytResponse.text();

    res.status(ytResponse.status);
    ytResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "transfer-encoding") res.setHeader(key, value);
    });
    res.send(data);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(502).json({ error: "YouTrack proxy error", detail: err.message });
  }
});

// ── Serve frontend ───────────────────────────────────────────────────────────
const distPath = join(__dirname, "../dist");
app.use(express.static(distPath));
app.get(/.*/, (_req, res) => res.sendFile(join(distPath, "index.html")));

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
createServer(app).listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Proxying YouTrack: ${YOUTRACK_URL}`);
});
