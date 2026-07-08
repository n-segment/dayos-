#!/usr/bin/env node
/**
 * Local tracker server (macOS)
 * - Polls frontmost application via osascript (System Events)
 * - Detects sleep/wake by gap between ticks → records "화면 꺼짐" segment
 * - Exposes simple HTTP endpoints for ui.html
 *
 * No external dependencies.
 */

const http = require("http");
const { execFile } = require("child_process");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 5179);
const POLL_MS = Number(process.env.POLL_MS || 4000);

// 이 배수 이상 tick이 늦으면 그 사이를 "화면 꺼짐"으로 기록
const SLEEP_THRESHOLD = 2.5;
const SLEEP_LABEL = "화면 꺼짐";

let tracking = false;
let pollTimer = null;
let lastSample = null;   // { app, atMs }
let lastTickAt = null;   // 마지막 tick 시각 (sleep 감지용)
let segments = [];       // { app, startMs, endMs }

// ── HTTP 응답 헬퍼 ──

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function ok(res, data) { json(res, 200, data); }
function bad(res, message, extra = {}) { json(res, 400, { ok: false, error: message, ...extra }); }

// ── macOS 앱 감지 ──

function runAppleScript(source, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "osascript",
      ["-e", source],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(String(stdout || "").trim());
      }
    );
    child.on("error", reject);
  });
}

async function getFrontmostApp() {
  const script = 'tell application "System Events" to get name of first application process whose frontmost is true';
  const name = await runAppleScript(script);
  return name || null;
}

// ── 세그먼트 관리 ──

function mergeOrPushSegment(app, startMs, endMs) {
  const last = segments[segments.length - 1];
  if (last && last.app === app && last.endMs >= startMs - POLL_MS * 1.2) {
    last.endMs = Math.max(last.endMs, endMs);
    return;
  }
  segments.push({ app, startMs, endMs });
}

// ── 핵심: tick마다 sleep gap 감지 ──

async function sampleOnce() {
  const atMs = Date.now();

  // 이전 tick과의 간격이 POLL_MS * SLEEP_THRESHOLD 이상이면 → 화면 꺼짐 구간 삽입
  if (lastTickAt !== null && atMs - lastTickAt > POLL_MS * SLEEP_THRESHOLD) {
    const sleepStart = lastTickAt;
    const sleepEnd = atMs;
    console.log(`[sleep] 화면 꺼짐 감지: ${toHHMM(sleepStart)} – ${toHHMM(sleepEnd)}`);
    // 진행 중이던 앱 구간 닫기
    if (lastSample && lastSample.app) {
      mergeOrPushSegment(lastSample.app, lastSample.atMs, sleepStart);
      lastSample = null;
    }
    // 화면 꺼짐 구간 기록
    segments.push({ app: SLEEP_LABEL, startMs: sleepStart, endMs: sleepEnd });
  }

  lastTickAt = atMs;

  let app = null;
  try {
    app = await getFrontmostApp();
  } catch {
    app = null;
  }

  if (!lastSample) {
    lastSample = { app, atMs };
    return;
  }

  const prev = lastSample;
  if (prev.app) {
    mergeOrPushSegment(prev.app, prev.atMs, atMs);
  }
  lastSample = { app, atMs };
}

// ── 트래킹 시작/종료 ──

function startTracking() {
  if (tracking) return;
  tracking = true;
  lastSample = null;
  lastTickAt = null;
  segments = [];
  pollTimer = setInterval(() => {
    sampleOnce().catch(() => {});
  }, POLL_MS);
}

async function stopTracking() {
  if (!tracking) return;
  tracking = false;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  try { await sampleOnce(); } catch { /* ignore */ }
}

// ── UI용 포맷 ──

function toHHMM(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function segmentsAsUI(trackedApps = []) {
  // trackedApps 필터 적용 + 화면 꺼짐은 항상 포함
  const filtered =
    Array.isArray(trackedApps) && trackedApps.length
      ? segments.filter((s) => trackedApps.includes(s.app) || s.app === SLEEP_LABEL)
      : segments.slice();

  return filtered.map((s) => ({
    app: s.app,
    start: toHHMM(s.startMs),
    end: toHHMM(s.endMs),
    startMs: s.startMs,
    endMs: s.endMs,
    minutes: Math.max(0, Math.round((s.endMs - s.startMs) / 60000)),
    isSleep: s.app === SLEEP_LABEL,
  }));
}

// ── HTTP 서버 ──

const server = http.createServer(async (req, res) => {
  if (!req.url) return bad(res, "No url");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return ok(res, { ok: true, port: PORT, pollMs: POLL_MS, tracking });
  }

  if (req.method === "POST" && path === "/start") {
    startTracking();
    return ok(res, { ok: true, tracking: true, pollMs: POLL_MS });
  }

  if (req.method === "POST" && path === "/stop") {
    await stopTracking();
    return ok(res, { ok: true, tracking: false });
  }

  if (req.method === "POST" && path === "/reset") {
    await stopTracking();
    lastSample = null;
    lastTickAt = null;
    segments = [];
    return ok(res, { ok: true });
  }

  if (req.method === "GET" && path === "/status") {
    const apps = url.searchParams.get("apps");
    const trackedApps = apps ? apps.split(",").map((s) => s.trim()).filter(Boolean) : [];
    return ok(res, {
      ok: true,
      tracking,
      pollMs: POLL_MS,
      segments: segmentsAsUI(trackedApps),
    });
  }

  return bad(res, "Not found", { path });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[tracker] listening on http://127.0.0.1:${PORT} (poll ${POLL_MS}ms)`);
  console.log(`[tracker] endpoints: POST /start | POST /stop | GET /status | GET /health`);
  console.log(`[tracker] sleep detection: gap > ${POLL_MS * SLEEP_THRESHOLD}ms → "${SLEEP_LABEL}"`);
});
