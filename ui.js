const $ = (id) => document.getElementById(id);

// ── Firebase 초기화 ──
const firebaseConfig = {
  apiKey: "AIzaSyAvYUxEMeE2u7r-xG54oLikYONw5czF0As",
  authDomain: "dayos-a94ff.firebaseapp.com",
  projectId: "dayos-a94ff",
  storageBucket: "dayos-a94ff.firebasestorage.app",
  messagingSenderId: "916662677161",
  appId: "1:916662677161:web:77f7b72beb4648cd1943b8",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

const els = {
  loginScreen: $("loginScreen"),
  googleLoginBtn: $("googleLoginBtn"),
  welcomeScreen: $("welcomeScreen"),
  goalModal: $("goalModal"),
  focusScreen: $("focusScreen"),
  summaryScreen: $("summaryScreen"),
  startButton: $("startButton"),
  endButton: $("endButton"),
  pauseButton: $("pauseButton"),
  viewRecordButton: $("viewRecordButton"),
  todayText: $("todayText"),
  nowTimeText: $("nowTimeText"),
  elapsedTimeText: $("elapsedTimeText"),
  startedMetaText: $("startedMetaText"),
  sessionBadge: $("sessionBadge"),
  summaryDateText: $("summaryDateText"),
  summaryFocusText: $("summaryFocusText"),
  summaryRetro: $("summaryRetro"),
  addNoteBtn: $("addNoteBtn"),
  checkinCancelBtn: $("checkinCancelBtn"),
  retroModal: $("retroModal"),
  retroModalTextarea: $("retroModalTextarea"),
  retroSkipBtn: $("retroSkipBtn"),
  retroSaveBtn: $("retroSaveBtn"),
  summaryBackButton: $("summaryBackButton"),
  summarySaveButton: $("summarySaveButton"),
  checkinZone: $("checkinZone"),
  checkinNext: $("checkinNext"),
  checkinLog: $("checkinLog"),
  checkinInputWrap: $("checkinInputWrap"),
  checkinInputLabel: $("checkinInputLabel"),
  checkinTextarea: $("checkinTextarea"),
  checkinSaveBtn: $("checkinSaveBtn"),
  timelineWrap: $("timelineWrap"),
  historyScreen: $("historyScreen"),
  historyBackButton: $("historyBackButton"),
  historyLinkButton: $("historyLinkButton"),
  historyWeekTotal: $("historyWeekTotal"),
  historyList: $("historyList"),
};

const STORAGE_KEY = "dayos_proto_v3";
const HISTORY_KEY = "dayos_history_v1";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TRACKER_BASE = "http://127.0.0.1:5179";
const TRACKED_APPS = ["Codex", "Cowork", "Claude", "Claude - Cowork", "Cursor"];

let startedAtMs = null;
let endedAtMs = null;
let pausedAt = null;
let totalPausedMs = 0;
let isPaused = false;
let timerId = null;
let trackerPollId = null;
let trackerAvailable = false;
let trackerMinutes = 0;
let lastSessionMs = 0;
let lastTrackerSegments = [];

const segmentMemos = {};

// ── 바운싱 이미지 이스터에그 ──
let bouncingImgActive = false;
let lastBounceHour = 0;

function showBouncingImage() {
  bouncingImgActive = true;
  const n = Math.floor(Math.random() * 4) + 1;
  const img = document.createElement("img");
  img.src = `./hidden_${n}.png`;

  const size = 130;
  let x = Math.random() * (window.innerWidth - size);
  let y = Math.random() * (window.innerHeight - size);
  let vx = (Math.random() > 0.5 ? 1 : -1) * (2.5 + Math.random() * 1.5);
  let vy = (Math.random() > 0.5 ? 1 : -1) * (2.5 + Math.random() * 1.5);

  img.style.cssText = `
    position: fixed;
    width: ${size}px;
    height: ${size}px;
    object-fit: contain;
    z-index: 9999;
    left: ${x}px;
    top: ${y}px;
    pointer-events: none;
    border-radius: 12px;
    transition: opacity 1s;
  `;
  document.body.appendChild(img);

  const moveId = setInterval(() => {
    x += vx;
    y += vy;
    if (x <= 0) { x = 0; vx = Math.abs(vx); }
    if (x >= window.innerWidth - size) { x = window.innerWidth - size; vx = -Math.abs(vx); }
    if (y <= 0) { y = 0; vy = Math.abs(vy); }
    if (y >= window.innerHeight - size) { y = window.innerHeight - size; vy = -Math.abs(vy); }
    img.style.left = x + "px";
    img.style.top = y + "px";
  }, 16);

  setTimeout(() => {
    clearInterval(moveId);
    img.style.opacity = "0";
    setTimeout(() => { img.remove(); bouncingImgActive = false; }, 1000);
  }, 60000);
}

function maybeTriggerBounce() {
  if (!startedAtMs || bouncingImgActive) return;
  const elapsedHours = Math.floor((Date.now() - startedAtMs) / 3600000);
  if (elapsedHours >= 1 && elapsedHours > lastBounceHour) {
    lastBounceHour = elapsedHours;
    showBouncingImage();
  }
}

// ── 태그 시스템 ──
const TAGS_KEY = 'dayos_user_tags';
let userTags = [];
const TAG_COLORS = ['#7eb8f7','#f7a87e','#a8f7a8','#f77eb8','#f7e07e','#b87ef7','#7ef7ee'];

function loadTags() {
  try { userTags = JSON.parse(localStorage.getItem(TAGS_KEY) || '[]'); } catch { userTags = []; }
}
function saveTags() { localStorage.setItem(TAGS_KEY, JSON.stringify(userTags)); }
function addUserTag(name) {
  name = name.trim();
  if (!name || userTags.find(t => t.name === name)) return null;
  const tag = { id: Date.now().toString(), name, color: TAG_COLORS[userTags.length % TAG_COLORS.length] };
  userTags.push(tag); saveTags(); return tag;
}
function getTag(id) { return userTags.find(t => t.id === id); }

// ── 시간별 체크인 ──
let checkIns = [];
let nextCheckInMs = null;
let checkinPending = false;

function segKey(seg) {
  return `${seg.app}__${seg.start}__${seg.end}`;
}

function getTimeOfDayText() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return { eyebrow: "MORNING", title: "오전부터 시작하다니", desc: "진짜 대단하다. 이 시간에 이러는 사람 별로 없음." };
  if (h >= 12 && h < 17) return { eyebrow: "AFTERNOON", title: "오늘도 화이팅 ദ്ദി (ˊᗜˋა)", desc: "어제보다 조금만 더. 그거면 충분해." };
  if (h >= 17 && h < 20) return { eyebrow: "", title: "오늘도 화이팅 ദ്ദി (ˊᗜˋა)", desc: "" };
  return { eyebrow: "", title: "오늘도 화이팅 ദ്ദി (ˊᗜˋა)", desc: "" };
}

function updateWelcomeScreen() {
  const nowEl = document.getElementById("welcomeNowTime");
  const eyebrowEl = document.getElementById("welcomeEyebrow");
  const titleEl = document.getElementById("welcomeTitle");
  const descEl = document.getElementById("welcomeDesc");
  if (!nowEl) return;
  const { eyebrow, title, desc } = getTimeOfDayText();
  nowEl.textContent = formatClock();
  if (eyebrowEl) eyebrowEl.textContent = eyebrow;
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
}

function formatDate(date = new Date()) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 · ${WEEKDAYS[date.getDay()]}요일`;
}

function formatClock(date = new Date()) {
  const hour24 = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const ampm = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${ampm} ${hour12}:${minute}`;
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${String(minutes).padStart(2, "0")}분`;
}

function formatMinutesTotal(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

// ── 체크인 함수들 ──

function checkinLabel(nthHour) {
  return `${nthHour}시간`;
}

function renderGoalChecklist() {
  const el = $("goalChecklist");
  if (!el) return;
  const validGoals = todayGoals.filter(g => g.task.trim());
  if (!validGoals.length) { el.classList.add("hidden"); return; }

  el.classList.remove("hidden");
  el.innerHTML = `<div class="goal-checklist__header">오늘의 목표</div>`;
  validGoals.forEach((g, i) => {
    const item = document.createElement("div");
    item.className = "goal-checklist__item" + (g.done ? " done" : "");
    item.dataset.idx = i;
    item.innerHTML = `
      <div class="goal-checklist__check">${g.done ? "✓" : ""}</div>
      <span class="goal-checklist__text">${g.task}</span>
      ${g.hours ? `<span class="goal-checklist__hours">${g.hours}h</span>` : ""}
    `;
    item.addEventListener("click", () => {
      validGoals[i].done = !validGoals[i].done;
      todayGoals.find(t => t === validGoals[i]).done = validGoals[i].done;
      renderGoalChecklist();
    });
    el.appendChild(item);
  });
}

function openCheckinInput() {
  renderGoalChecklist();
  els.checkinInputWrap.classList.remove("hidden");
  els.checkinTextarea.focus();
}

function closeCheckinInput() {
  els.checkinInputWrap.classList.add("hidden");
  els.checkinTextarea.value = "";
}

function fmtDur(ms) {
  if (!ms || ms < 0) return "0분";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function parseDurInput(str) {
  // "1시간 30분", "1:30", "90분", "90", "1h30m" 등 파싱 → ms 반환, 실패 시 null
  if (!str) return null;
  str = str.trim();
  // X시간 Y분
  let m = str.match(/^(\d+)\s*시간\s*(\d+)?\s*분?$/);
  if (m) return (parseInt(m[1]) * 60 + parseInt(m[2] || 0)) * 60000;
  // X분
  m = str.match(/^(\d+)\s*분$/);
  if (m) return parseInt(m[1]) * 60000;
  // X:XX (시:분)
  m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return (parseInt(m[1]) * 60 + parseInt(m[2])) * 60000;
  // 숫자만 → 분으로 처리
  m = str.match(/^(\d+)$/);
  if (m) return parseInt(m[1]) * 60000;
  return null;
}

function saveCheckin() {
  const text = els.checkinTextarea.value.trim();
  if (!text) return;
  const now = Date.now();
  const durStr = document.getElementById("checkinDurInput")?.value?.trim() || "";
  const manualDurMs = parseDurInput(durStr);

  // 이전 라이브 태스크 시간 확정
  if (checkIns.length > 0) {
    const last = checkIns[checkIns.length - 1];
    if (last.isLive && !last.endMs) {
      last.endMs = now;
      last.durationMs = now - last.timeMs;
      last.isLive = false;
    }
  }

  if (manualDurMs !== null) {
    // 소급 입력: 시간 확정해서 저장
    checkIns.push({ timeMs: now - manualDurMs, label: formatClock(new Date(now - manualDurMs)), text, endMs: now, durationMs: manualDurMs, isLive: false });
  } else {
    // 라이브 타이머 시작
    checkIns.push({ timeMs: now, label: formatClock(new Date()), text, endMs: null, durationMs: null, isLive: true });
  }

  if (document.getElementById("checkinDurInput")) document.getElementById("checkinDurInput").value = "";
  closeCheckinInput();
  renderCheckinLog();
}

function skipCheckin() {
  const nthHour = checkIns.length + 1;
  checkIns.push({
    timeMs: Date.now(),
    label: checkinLabel(nthHour),
    text: null,
  });
  nextCheckInMs = startedAtMs + checkIns.length * 3600000;
  closeCheckinInput();
  renderCheckinLog();
}

function renderCheckinLog() {
  if (!els.checkinLog) return;
  els.checkinLog.innerHTML = "";
  checkIns.forEach((c, idx) => {
    if (!c.text) return;
    const isActive = c.isLive && !c.endMs;
    const li = document.createElement("li");
    li.className = "task-log-item" + (isActive ? " task-log-item--active" : "");
    const durHtml = isActive
      ? `<span class="task-log-dur" id="current-task-time">${fmtDur(Date.now() - c.timeMs)}</span>`
      : `<span class="task-log-dur">${fmtDur(c.durationMs)}</span>`;
    li.innerHTML = `
      <span class="task-log-dot">${isActive ? "●" : "✓"}</span>
      <span class="task-log-name">${c.text}</span>
      ${durHtml}
    `;
    els.checkinLog.appendChild(li);
  });
}

window.editCheckin = function(idx) {
  const c = checkIns[idx];
  if (!c) return;
  const items = els.checkinLog.querySelectorAll(".checkin-log__item");
  const li = items[idx];
  if (!li) return;

  const currentText = c.text || "";
  li.classList.add("checkin-log__item--editing");
  li.innerHTML = `
    <span class="checkin-log__time">${formatClock(new Date(c.timeMs))}</span>
    <span class="checkin-log__label">${c.label}</span>
    <textarea class="checkin-edit-textarea">${currentText}</textarea>
    <div class="checkin-edit-actions">
      <button class="checkin-save-btn" onclick="saveCheckinEdit(${idx})">저장</button>
      <button class="checkin-skip-btn" onclick="renderCheckinLog()">취소</button>
    </div>
  `;
  const ta = li.querySelector("textarea");
  ta.focus();
  ta.selectionStart = ta.selectionEnd = ta.value.length;
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveCheckinEdit(idx);
  });
};

window.saveCheckinEdit = function(idx) {
  const items = els.checkinLog.querySelectorAll(".checkin-log__item");
  const li = items[idx];
  if (!li) return;
  const val = li.querySelector("textarea").value.trim();
  checkIns[idx].text = val || "(기록 없음)";
  renderCheckinLog();
};

function updateCheckinNext() {
  if (!els.checkinNext || !startedAtMs) return;
  if (checkinPending) {
    els.checkinNext.textContent = "";
    els.checkinNext.classList.remove("checkin-next--alert");
    return;
  }
  const nowMs = Date.now();
  const msLeft = nextCheckInMs - nowMs;
  if (msLeft <= 0) {
    if (!checkinPending) openCheckinInput();
    return;
  }
  const minLeft = Math.ceil(msLeft / 60000);
  if (minLeft <= 5) {
    els.checkinNext.textContent = `체크인까지 ${minLeft}분`;
    els.checkinNext.classList.add("checkin-next--alert");
  } else {
    els.checkinNext.textContent = `다음 체크인 ${formatClock(new Date(nextCheckInMs))} · ${minLeft}분 후`;
    els.checkinNext.classList.remove("checkin-next--alert");
  }
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function sendHourNotification(nthHour) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(`${nthHour}시간 지났어요.`, {
    body: "잠깐 스트레칭하고 뭐 했는지 기록해봐요 ദ്ദി (ˊᗜˋა)",
    icon: "./hidden_1.png",
  });
}

function initCheckin() {
  checkIns = [];
  checkinPending = false;
  nextCheckInMs = startedAtMs + 3600000;
  closeCheckinInput();
  renderCheckinLog();
  if (els.checkinNext) els.checkinNext.textContent = "";
}

function getTrackerMinutesFromSegments(segments) {
  if (!Array.isArray(segments)) return 0;
  const totalMs = segments.reduce((sum, seg) => {
    if (!seg || typeof seg !== "object") return sum;
    if (typeof seg.startMs === "number" && typeof seg.endMs === "number") {
      return sum + Math.max(0, seg.endMs - seg.startMs);
    }
    if (typeof seg.minutes === "number") return sum + Math.max(0, seg.minutes * 60000);
    return sum;
  }, 0);
  return Math.floor(totalMs / 60000);
}

function renderLiveSegments() { /* tracker UI removed */ }
function renderTrackerSummary() { /* tracker UI removed */ }

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ startedAtMs }));
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.startedAtMs === "number") {
      startedAtMs = parsed.startedAtMs;
    }
  } catch { /* noop */ }
}

function showScreen(screen) {
  const loginOverlay = document.getElementById("loginScreen");
  const appMain = document.getElementById("appMain");
  const summaryOverlay = document.getElementById("summaryScreen");
  const wsIdleState = document.getElementById("wsIdleState");
  const wsActiveState = document.getElementById("wsActiveState");

  if (screen === "login") {
    loginOverlay?.classList.add("is-active");
    appMain?.classList.add("hidden");
    return;
  }

  // Logged in — show app
  loginOverlay?.classList.remove("is-active");
  appMain?.classList.remove("hidden");

  if (screen === "focus") {
    wsIdleState?.classList.add("hidden");
    wsActiveState?.classList.remove("hidden");
    summaryOverlay?.classList.add("hidden");
    document.getElementById("workspaceSection")
      ?.scrollIntoView({ behavior: "smooth" });
  } else if (screen === "welcome") {
    if (!startedAtMs) {
      wsIdleState?.classList.remove("hidden");
      wsActiveState?.classList.add("hidden");
    }
    summaryOverlay?.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (screen === "history") {
    summaryOverlay?.classList.add("hidden");
    document.getElementById("workspaceSection")
      ?.scrollIntoView({ behavior: "smooth" });
  } else if (screen === "summary") {
    summaryOverlay?.classList.remove("hidden");
  }
}

// ── 목표 설정 ──
let todayGoals = [];

function renderGoalTasks() {
  const container = $("goalTasks");
  if (!container) return;
  container.innerHTML = "";
  todayGoals.forEach((g, i) => {
    const row = document.createElement("div");
    row.className = "goal-task-row";
    row.innerHTML = `
      <input class="goal-task-name" type="text" placeholder="할 일을 적어요" value="${g.task}" data-idx="${i}" />
      <div class="goal-task-hours-wrap">
        <input class="goal-task-hours" type="text" inputmode="decimal" value="${g.hours}" data-idx="${i}" />
        <span class="goal-task-hours-label">시간</span>
      </div>
      <button class="goal-task-del" data-idx="${i}" aria-label="삭제">×</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll(".goal-task-name").forEach(input => {
    input.addEventListener("input", e => {
      todayGoals[+e.target.dataset.idx].task = e.target.value;
    });
  });
  container.querySelectorAll(".goal-task-hours").forEach(input => {
    input.addEventListener("input", e => {
      todayGoals[+e.target.dataset.idx].hours = parseFloat(e.target.value) || 0;
      updateGoalTotal();
    });
  });
  container.querySelectorAll(".goal-task-del").forEach(btn => {
    btn.addEventListener("click", e => {
      todayGoals.splice(+e.target.dataset.idx, 1);
      renderGoalTasks();
      updateGoalTotal();
    });
  });
}

function updateGoalTotal() {
  const total = todayGoals.reduce((s, g) => s + (g.hours || 0), 0);
  const el = $("goalTotalVal");
  if (!el) return;
  if (total <= 0) { el.textContent = "—"; return; }

  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  const durationStr = h > 0 && m > 0 ? `${h}시간 ${m}분` : h > 0 ? `${h}시간` : `${m}분`;

  // 시작 시간 파싱해서 종료 시간 계산
  const startInput = ($("goalStartTime")?.value || "").trim();
  let endStr = "";
  const match = startInput.match(/([오전오후]+)\s*(\d+):(\d+)/);
  if (match) {
    let hour = parseInt(match[2]);
    const min = parseInt(match[3]);
    if (match[1] === "오후" && hour !== 12) hour += 12;
    if (match[1] === "오전" && hour === 12) hour = 0;
    const totalMin = hour * 60 + min + Math.round(total * 60);
    const endH24 = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    const ampm = endH24 < 12 ? "오전" : "오후";
    const endH12 = endH24 % 12 === 0 ? 12 : endH24 % 12;
    endStr = `${ampm} ${endH12}:${String(endM).padStart(2, "0")} (${durationStr})`;
  }

  el.textContent = endStr || durationStr;
}

function addGoalTask() {
  todayGoals.push({ task: "", hours: 1 });
  renderGoalTasks();
  updateGoalTotal();
  const inputs = document.querySelectorAll(".goal-task-name");
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function openGoalModal() {
  if (!todayGoals.length) todayGoals = [{ task: "", hours: 1 }];
  renderGoalTasks();
  const timeEl = $("goalStartTime");
  if (timeEl && !timeEl.value) timeEl.value = formatClock();
  updateGoalTotal();
  if (els.goalModal) els.goalModal.classList.remove("hidden");
}

function closeGoalModal() {
  if (els.goalModal) els.goalModal.classList.add("hidden");
}

// ── Google 로그인 ──
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch((err) => {
    console.error("로그인 실패:", err);
  });
}

function signOut() {
  auth.signOut();
}

// ── 히스토리 저장/조회 (Firestore + localStorage fallback) ──

function toDateStr(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function saveSessionToHistory() {
  const retro = els.summaryRetro ? els.summaryRetro.value.trim() : "";
  const sessionStart = endedAtMs ? endedAtMs - lastSessionMs : Date.now() - lastSessionMs;
  // 마지막 라이브 태스크 시간 확정
  if (checkIns.length > 0) {
    const last = checkIns[checkIns.length - 1];
    if (last.isLive && !last.endMs) {
      last.endMs = endedAtMs || Date.now();
      last.durationMs = last.endMs - last.timeMs;
      last.isLive = false;
    }
  }
  const record = {
    date: toDateStr(endedAtMs || Date.now()),
    startMs: sessionStart,
    endMs: endedAtMs || Date.now(),
    durationMs: lastSessionMs,
    checkIns: checkIns.map(c => ({...c})),
    retro,
  };

  // localStorage 저장 (항상)
  const localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  localHistory.push(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(localHistory));

  // Firestore 저장 (로그인 시)
  if (currentUser) {
    try {
      await db.collection("users").doc(currentUser.uid)
        .collection("history").add(record);
    } catch (e) {
      console.error("Firestore 저장 실패:", e);
    }
  }
}

async function getHistory() {
  if (currentUser) {
    try {
      const snapshot = await db.collection("users").doc(currentUser.uid)
        .collection("history").orderBy("startMs", "asc").get();
      return snapshot.docs.map(doc => ({ ...doc.data(), _id: doc.id }));
    } catch (e) {
      console.error("Firestore 로드 실패:", e);
    }
  }
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
}

async function updateRecord(id, fields) {
  if (currentUser && id) {
    try {
      await db.collection("users").doc(currentUser.uid)
        .collection("history").doc(id).update(fields);
    } catch (e) {
      console.error("Firestore 업데이트 실패:", e);
    }
  }
  // localStorage fallback: date-based match
  if (fields.date || fields.startMs) {
    const local = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    const idx = local.findIndex(r => r._id === id || r.startMs === fields._startMs);
    if (idx !== -1) {
      Object.assign(local[idx], fields);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(local));
    }
  }
}

async function deleteRecord(id) {
  if (currentUser && id) {
    try {
      await db.collection("users").doc(currentUser.uid)
        .collection("history").doc(id).delete();
    } catch (e) {
      console.error("Firestore 삭제 실패:", e);
    }
  }
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  mon.setHours(0,0,0,0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23,59,59,999);
  return { mon, sun };
}

let historyTab = "week";

// ─── 히스토리 화면 (신규 디자인) ──────────────────────────────────
let _histDate = null;
let _histView = 'day'; // 'day' | 'week' | 'month'

function getWeekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return toDateStr(d.getTime());
}

function getWeekDates(weekStart) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + i);
    dates.push(toDateStr(d.getTime()));
  }
  return dates;
}

async function renderHistoryScreen(dateStr) {
  const todayStr = toDateStr(Date.now());
  _histDate = dateStr || todayStr;

  const panel = document.querySelector("#historyScreen .history-panel");
  panel.innerHTML = "";

  const header = document.createElement("div");
  header.className = "hs-header";
  panel.appendChild(header);

  const content = document.createElement("div");
  content.className = "hs-content";
  panel.appendChild(content);

  function buildHeader() {
    const d = new Date(_histDate + "T00:00:00");
    const DAYS = ["일","월","화","수","목","금","토"];
    let dateLabel = "";
    let todayLabel = "오늘";

    if (_histView === 'day') {
      dateLabel = `${d.getMonth()+1}월 ${d.getDate()}일, ${DAYS[d.getDay()]}요일`;
    } else if (_histView === 'week') {
      const ws = getWeekStart(_histDate);
      const wsD = new Date(ws + "T00:00:00");
      const weD = new Date(ws + "T00:00:00"); weD.setDate(weD.getDate() + 6);
      const sameMonth = wsD.getMonth() === weD.getMonth();
      dateLabel = sameMonth
        ? `${wsD.getMonth()+1}월 ${wsD.getDate()}일 - ${weD.getDate()}일`
        : `${wsD.getMonth()+1}/${wsD.getDate()} - ${weD.getMonth()+1}/${weD.getDate()}`;
      todayLabel = "이번주";
    } else {
      dateLabel = `${d.getFullYear()}년 ${d.getMonth()+1}월`;
      todayLabel = "이번달";
    }

    header.innerHTML = `
      <div class="hs-header-left">
        <button class="hs-back-btn" id="hsBack">‹</button>
        <span class="hs-date-label">${dateLabel}</span>
      </div>
      <div class="hs-header-right">
        <div class="hs-view-toggle">
          <button class="hs-view-btn${_histView==='day'?' active':''}" data-view="day">일</button>
          <button class="hs-view-btn${_histView==='week'?' active':''}" data-view="week">주</button>
          <button class="hs-view-btn${_histView==='month'?' active':''}" data-view="month">월</button>
        </div>
        <div class="hs-nav-group">
          <button class="hs-nav-btn" id="hsPrev">‹</button>
          <button class="hs-nav-btn hs-nav-btn--today" id="hsToday">${todayLabel}</button>
          <button class="hs-nav-btn" id="hsNext">›</button>
        </div>
      </div>
    `;

    document.getElementById("hsBack").addEventListener("click", () => showScreen(startedAtMs ? "focus" : "welcome"));

    header.querySelectorAll(".hs-view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        _histView = btn.dataset.view;
        buildHeader();
        loadCurrentView();
      });
    });

    document.getElementById("hsPrev").addEventListener("click", () => navigateView(-1));
    document.getElementById("hsToday").addEventListener("click", () => {
      _histDate = todayStr; buildHeader(); loadCurrentView();
    });
    document.getElementById("hsNext").addEventListener("click", () => navigateView(1));
  }

  function navigateView(dir) {
    const d = new Date(_histDate + "T00:00:00");
    if (_histView === 'day') {
      d.setDate(d.getDate() + dir);
    } else if (_histView === 'week') {
      d.setDate(d.getDate() + (dir * 7));
    } else {
      d.setMonth(d.getMonth() + dir);
      d.setDate(1);
    }
    _histDate = toDateStr(d.getTime());
    buildHeader();
    loadCurrentView();
  }

  function loadCurrentView() {
    if (_histView === 'day') {
      loadHistoryDay(_histDate, content);
    } else if (_histView === 'week') {
      loadHistoryWeek(getWeekStart(_histDate), content);
    } else {
      const d = new Date(_histDate + "T00:00:00");
      loadHistoryMonth(d.getFullYear(), d.getMonth(), content);
    }
  }

  buildHeader();
  loadCurrentView();
}

// ── 주 뷰 ──────────────────────────────────────────────────────────
async function loadHistoryWeek(weekStart, container) {
  container.innerHTML = `<div class="hs-loading">불러오는 중...</div>`;
  const dates = getWeekDates(weekStart);
  const recordsByDate = {};
  dates.forEach(d => { recordsByDate[d] = []; });
  if (currentUser) {
    try {
      const snaps = await Promise.all(dates.map(dt =>
        db.collection("users").doc(currentUser.uid)
          .collection("history").where("date","==",dt).get()
      ));
      snaps.forEach((snap, i) => {
        recordsByDate[dates[i]] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      });
    } catch(e) {}
  }
  renderWeekView(container, recordsByDate, dates);
}

function renderWeekView(container, recordsByDate, dates) {
  container.innerHTML = "";
  const HOUR_H = 56; // px per hour
  const todayStr = toDateStr(Date.now());
  const DAYS_KO = ["일","월","화","수","목","금","토"];

  const wrap = document.createElement("div");
  wrap.className = "hs-week-wrap";

  // ─ 헤더 (요일/날짜) ─
  const hdr = document.createElement("div");
  hdr.className = "hs-week-header";
  hdr.innerHTML = `<div class="hs-week-tc"></div>` + dates.map(dt => {
    const d = new Date(dt + "T00:00:00");
    const isToday = dt === todayStr;
    return `<div class="hs-week-dc">
      <span class="hs-week-dayname">${DAYS_KO[d.getDay()]}</span>
      <span class="hs-week-daynum${isToday?' is-today':''}">${d.getDate()}</span>
    </div>`;
  }).join("");
  wrap.appendChild(hdr);

  // ─ 바디 ─
  const bodyWrap = document.createElement("div");
  bodyWrap.className = "hs-week-body";

  // 시간 레이블 컬럼
  const tc = document.createElement("div");
  tc.className = "hs-week-tc hs-week-time-col";
  for (let h = 0; h < 24; h++) {
    const lbl = document.createElement("div");
    lbl.className = "hs-week-hour-label";
    lbl.style.height = HOUR_H + "px";
    lbl.textContent = h ? `${h}시` : "";
    tc.appendChild(lbl);
  }
  bodyWrap.appendChild(tc);

  // 요일별 컬럼
  dates.forEach(dt => {
    const dayStart = new Date(dt + "T00:00:00").getTime();
    const col = document.createElement("div");
    col.className = "hs-week-day-col";
    col.style.height = (HOUR_H * 24) + "px";

    // 시간별 그리드선
    for (let h = 0; h < 24; h++) {
      const line = document.createElement("div");
      line.className = "hs-week-hour-line";
      line.style.top = (h * HOUR_H) + "px";
      col.appendChild(line);
    }

    // 이벤트 블록
    const records = recordsByDate[dt] || [];
    records.flatMap(r =>
      (r.checkIns || []).map((c, i) => ({ ...c, _record: r, _idx: i }))
    ).filter(c => c.text && c.text !== "(기록 없음)" && c.timeMs).forEach(c => {
      const topPx = ((c.timeMs - dayStart) / 3600000) * HOUR_H;
      if (topPx < 0 || topPx > HOUR_H * 24) return;
      const heightPx = c.durationMs ? Math.max((c.durationMs / 3600000) * HOUR_H, 20) : 20;
      const tag = c.tags && c.tags[0] ? getTag(c.tags[0]) : null;
      const color = tag ? tag.color : "rgba(255,255,255,0.35)";
      const blk = document.createElement("div");
      blk.className = "hs-week-event";
      blk.style.cssText = `top:${topPx.toFixed(1)}px;height:${heightPx.toFixed(1)}px;border-left:3px solid ${color};background:${color}1a;`;
      blk.innerHTML = `<span class="hs-week-event-title">${c.text}</span>`;
      col.appendChild(blk);
    });

    // 현재 시각 선
    if (dt === todayStr) {
      const nowTop = ((Date.now() - dayStart) / 3600000) * HOUR_H;
      const nl = document.createElement("div");
      nl.className = "hs-week-now-line";
      nl.style.top = nowTop.toFixed(1) + "px";
      nl.innerHTML = `<div class="hs-week-now-dot"></div>`;
      col.appendChild(nl);
    }

    bodyWrap.appendChild(col);
  });

  wrap.appendChild(bodyWrap);
  container.appendChild(wrap);

  // 현재 시각으로 스크롤
  const scrollTarget = dates.includes(todayStr)
    ? Math.max(0, new Date().getHours() * HOUR_H - 120)
    : 8 * HOUR_H;
  setTimeout(() => { bodyWrap.scrollTop = scrollTarget; }, 50);
}

// ── 월 뷰 ──────────────────────────────────────────────────────────
async function loadHistoryMonth(year, month, container) {
  container.innerHTML = `<div class="hs-loading">불러오는 중...</div>`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  const recordsByDate = {};
  dates.forEach(d => { recordsByDate[d] = []; });
  if (currentUser) {
    try {
      const snaps = await Promise.all(dates.map(dt =>
        db.collection("users").doc(currentUser.uid)
          .collection("history").where("date","==",dt).get()
      ));
      snaps.forEach((snap, i) => {
        recordsByDate[dates[i]] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      });
    } catch(e) {}
  }
  renderMonthView(container, recordsByDate, year, month);
}

function renderMonthView(container, recordsByDate, year, month) {
  container.innerHTML = "";
  const todayStr = toDateStr(Date.now());
  const DAYS_KO = ["일","월","화","수","목","금","토"];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const wrap = document.createElement("div");
  wrap.className = "hs-month-wrap";

  // 요일 헤더
  const dayHdr = document.createElement("div");
  dayHdr.className = "hs-month-day-headers";
  DAYS_KO.forEach(d => {
    const el = document.createElement("div");
    el.className = "hs-month-day-hdr";
    el.textContent = d;
    dayHdr.appendChild(el);
  });
  wrap.appendChild(dayHdr);

  // 날짜 그리드
  const grid = document.createElement("div");
  grid.className = "hs-month-grid";

  // 빈 셀 (월 첫날 전)
  for (let i = 0; i < firstDayOfWeek; i++) {
    const cell = document.createElement("div");
    cell.className = "hs-month-cell hs-month-cell--empty";
    grid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const records = recordsByDate[dt] || [];
    const totalMs = records.flatMap(r => r.checkIns || [])
      .reduce((s, c) => s + (c.durationMs || 0), 0);

    const cell = document.createElement("div");
    cell.className = `hs-month-cell${dt === todayStr ? ' is-today' : ''}`;

    const num = document.createElement("div");
    num.className = "hs-month-num";
    num.textContent = d;
    cell.appendChild(num);

    if (totalMs > 0) {
      const dur = document.createElement("div");
      dur.className = "hs-month-dur";
      const h = Math.floor(totalMs / 3600000);
      const m = Math.floor((totalMs % 3600000) / 60000);
      dur.textContent = h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`;
      cell.appendChild(dur);
    }

    cell.addEventListener("click", () => {
      _histDate = dt;
      _histView = 'day';
      renderHistoryScreen(dt);
    });

    grid.appendChild(cell);
  }

  wrap.appendChild(grid);
  container.appendChild(wrap);
}

async function loadHistoryDay(dateStr, container) {
  container.innerHTML = `<div class="hs-loading">불러오는 중...</div>`;
  let records = [];
  if (currentUser) {
    try {
      const snap = await db.collection("users").doc(currentUser.uid)
        .collection("history").where("date","==",dateStr).get();
      records = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    } catch(e) {}
  }
  renderDayContent(container, records, dateStr);
}

function renderDayContent(container, records, dateStr) {
  container.innerHTML = "";
  const todayStr = toDateStr(Date.now());
  const allCheckIns = records.flatMap(r =>
    (r.checkIns || []).map((c, i) => ({ ...c, _idx: i, _record: r }))
  ).filter(c => c.text && c.text !== "(기록 없음)");

  // ── 1. 타임라인 (checkIn 기반으로 그림) ──
  const isToday = dateStr === todayStr;
  const dayStart = new Date(dateStr + "T00:00:00").getTime();
  const nowMs = Date.now();
  const nowPct = isToday ? ((nowMs - dayStart) / 86400000 * 100).toFixed(2) : null;
  const nowH = new Date().getHours();
  const nowMm = String(new Date().getMinutes()).padStart(2,"0");

  const tlSection = document.createElement("div");
  tlSection.className = "hs-tl-section";
  tlSection.innerHTML = `
    <div class="hs-tl-header">
      <span class="hs-section-label">오늘의 타임라인</span>
      ${isToday ? `<span class="hs-tl-now-label">${nowH}:${nowMm} 진행 중</span>` : ""}
    </div>
    <div class="hs-tl-wrap" id="hsTlWrap">
      ${isToday ? `<div class="hs-tl-now-marker" style="left:${nowPct}%"></div>` : ""}
    </div>
    <div class="hs-tl-axis"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>
  `;
  container.appendChild(tlSection);

  const tlWrap = tlSection.querySelector("#hsTlWrap");
  // 시간별 그리드 선 (1~23시)
  for (let h = 1; h < 24; h++) {
    const line = document.createElement("div");
    line.className = "hs-tl-grid-line";
    line.style.left = (h / 24 * 100).toFixed(3) + "%";
    tlWrap.appendChild(line);
  }
  allCheckIns.filter(c => c.timeMs).forEach(c => {
    const left = Math.max(0, ((c.timeMs - dayStart) / 86400000 * 100)).toFixed(2);
    const t = c.tags && c.tags[0] ? getTag(c.tags[0]) : null;
    const color = t ? t.color : "rgba(255,255,255,0.5)";
    if (c.durationMs > 0) {
      const width = Math.max((c.durationMs / 86400000 * 100), 0.5).toFixed(2);
      const seg = document.createElement("div");
      seg.className = "hs-tl-seg";
      seg.style.left = left + "%";
      seg.style.width = width + "%";
      seg.style.background = color;
      tlWrap.appendChild(seg);
    } else {
      const marker = document.createElement("div");
      marker.className = "hs-tl-marker";
      marker.style.left = left + "%";
      marker.style.background = color;
      tlWrap.appendChild(marker);
    }
  });

  // ── 2. 스탯 카드 (checkIn 합산) ──
  const totalMs = allCheckIns.reduce((s, c) => s + (c.durationMs || 0), 0);
  const tagTotals = {};
  allCheckIns.forEach(c => {
    if (c.tags && c.durationMs) c.tags.forEach(tid => { tagTotals[tid] = (tagTotals[tid] || 0) + c.durationMs; });
  });

  const statsRow = document.createElement("div");
  statsRow.className = "hs-stats-row";
  Object.entries(tagTotals).forEach(([tid, ms]) => {
    const tag = getTag(tid); if (!tag) return;
    const card = document.createElement("div");
    card.className = "hs-stat-card";
    card.innerHTML = `<div class="hs-stat-label"><span class="hs-stat-dot" style="background:${tag.color}"></span>${tag.name}</div><div class="hs-stat-value">${fmtDur(ms)}</div>`;
    statsRow.appendChild(card);
  });
  container.appendChild(statsRow);

  // ── 3. 기록 리스트 ──
  if (allCheckIns.length > 0) {
    const morning = [];
    const afternoon = allCheckIns;

    const renderGroup = (label, items) => {
      if (!items.length) return;
      const card = document.createElement("div");
      card.className = "hs-record-card";

      let dragSrc = null;

      items.forEach((c, itemIdx) => {
        const tagColor = c.tags && c.tags[0] ? (getTag(c.tags[0])?.color || "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.12)";
        const startTime = c.timeMs ? formatClock(new Date(c.timeMs)) : "";
        const endTime = c.endMs ? formatClock(new Date(c.endMs)) : "";
        const timeRange = (startTime && endTime) ? `${startTime} → ${endTime}` : startTime;
        const item = document.createElement("div");
        item.className = "hs-record-item";
        item.draggable = true;
        item.dataset.itemidx = itemIdx;
        item.innerHTML = `
          <div class="hs-drag-handle">⠿</div>
          <div class="hs-record-bar" style="background:${tagColor}"></div>
          <div class="hs-record-body">
            <div class="hs-record-name">${c.text}</div>
            ${timeRange ? `<div class="hs-record-time">${timeRange}</div>` : ""}
          </div>
          <div class="hs-record-dur">${c.durationMs ? fmtDur(c.durationMs) : ""}</div>
          <div class="hs-dots-wrap">
            <button class="hs-dots-btn">⋮</button>
            <div class="hs-dots-menu">
              <button class="hs-dots-item" data-action="edit">수정</button>
              <button class="hs-dots-item hs-dots-del" data-action="del">삭제</button>
            </div>
          </div>
        `;

        // drag-to-reorder
        item.addEventListener("dragstart", e => {
          dragSrc = item;
          e.dataTransfer.effectAllowed = "move";
          setTimeout(() => item.classList.add("hs-dragging"), 0);
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("hs-dragging");
          card.querySelectorAll(".hs-drag-over").forEach(el => el.classList.remove("hs-drag-over"));
          dragSrc = null;
        });
        item.addEventListener("dragover", e => {
          e.preventDefault();
          if (item !== dragSrc) {
            card.querySelectorAll(".hs-drag-over").forEach(el => el.classList.remove("hs-drag-over"));
            item.classList.add("hs-drag-over");
          }
        });
        item.addEventListener("dragleave", () => item.classList.remove("hs-drag-over"));
        item.addEventListener("drop", async e => {
          e.preventDefault();
          item.classList.remove("hs-drag-over");
          if (!dragSrc || dragSrc === item) return;
          const srcIdx = parseInt(dragSrc.dataset.itemidx);
          const dstIdx = parseInt(item.dataset.itemidx);
          const srcC = items[srcIdx];
          const dstC = items[dstIdx];
          if (srcC._record._id !== dstC._record._id) return;
          const ci = [...srcC._record.checkIns];
          const [moved] = ci.splice(srcC._idx, 1);
          const adjDst = dstC._idx > srcC._idx ? dstC._idx - 1 : dstC._idx;
          ci.splice(adjDst, 0, moved);
          await updateRecord(srcC._record._id, { checkIns: ci });
          renderDayContent(container, records, dateStr);
        });

        const dotsBtn = item.querySelector(".hs-dots-btn");
        const dotsMenu = item.querySelector(".hs-dots-menu");
        dotsBtn.addEventListener("click", e => {
          e.stopPropagation();
          const isOpen = dotsMenu.classList.contains("open");
          document.querySelectorAll(".hs-dots-menu.open").forEach(m => m.classList.remove("open"));
          if (!isOpen) dotsMenu.classList.add("open");
        });
        document.addEventListener("click", () => dotsMenu.classList.remove("open"), { once: false });
        item.querySelector("[data-action=edit]").addEventListener("click", e => {
          e.stopPropagation();
          dotsMenu.classList.remove("open");
          showEditRecordModal(c, records, dateStr, container);
        });
        item.querySelector("[data-action=del]").addEventListener("click", async e => {
          e.stopPropagation();
          dotsMenu.classList.remove("open");
          if (!confirm("삭제할까요?")) return;
          c._record.checkIns.splice(c._idx, 1);
          await updateRecord(c._record._id, { checkIns: c._record.checkIns });
          renderDayContent(container, records, dateStr);
        });
        card.appendChild(item);
      });
      container.appendChild(card);
    };

    renderGroup("오전", morning);
    renderGroup("오후", afternoon);
  }

  // ── 4. 기록 추가 ──
  const addBtn = document.createElement("div");
  addBtn.className = "hs-add-btn";
  addBtn.innerHTML = "기록 추가";
  addBtn.addEventListener("click", () => showAddRecordModal(records, dateStr, container));
  container.appendChild(addBtn);

  // ── 5. 회고 ──
  const retroRecord = [...records].reverse().find(r => r.retro) || records[records.length - 1];
  const retroSection = document.createElement("div");
  retroSection.className = "hs-retro-section";
  const retroLabel = document.createElement("div");
  retroLabel.className = "hs-section-label";
  retroLabel.textContent = "오늘 회고";
  retroSection.appendChild(retroLabel);
  const retroTa = document.createElement("textarea");
  retroTa.className = "hs-retro-ta";
  retroTa.placeholder = "오늘 하루를 돌아보세요...";
  retroTa.value = retroRecord?.retro || "";
  let retroTimer;
  retroTa.addEventListener("input", () => {
    clearTimeout(retroTimer);
    retroTimer = setTimeout(async () => {
      if (retroRecord?._id) { retroRecord.retro = retroTa.value; await updateRecord(retroRecord._id, { retro: retroTa.value }); }
    }, 800);
  });
  retroSection.appendChild(retroTa);
  container.appendChild(retroSection);
}

function showAddRecordModal(records, dateStr, container) {
  document.getElementById("hsAddModal")?.remove();
  let selectedTagIds = [];
  const dayStart = new Date(dateStr + "T00:00:00").getTime();

  const parseHM = str => {
    if (!str) return null;
    str = str.trim();
    let m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return { h: parseInt(m[1]), min: parseInt(m[2]) };
    m = str.match(/^(\d{1,2})시(\d{2})?분?$/);
    if (m) return { h: parseInt(m[1]), min: m[2] ? parseInt(m[2]) : 0 };
    return null;
  };

  const overlay = document.createElement("div");
  overlay.className = "hs-modal-overlay";
  overlay.id = "hsAddModal";
  overlay.innerHTML = `
    <div class="hs-modal">
      <div class="hs-modal-header">
        <span class="hs-modal-title">기록 추가</span>
        <button class="hs-modal-close" id="hsModalClose">×</button>
      </div>
      <div class="hs-modal-field">
        <label class="hs-modal-label">활동명</label>
        <input class="hs-modal-input" id="hsModalText" placeholder="무엇을 했나요?" />
      </div>
      <div class="hs-modal-field">
        <label class="hs-modal-label">카테고리</label>
        <div class="hs-modal-tags" id="hsModalTags"></div>
      </div>
      <div class="hs-modal-time-row">
        <div class="hs-modal-field">
          <label class="hs-modal-label">시작 시간</label>
          <input class="hs-modal-input" id="hsModalStart" placeholder="14:00" />
        </div>
        <div class="hs-modal-field">
          <label class="hs-modal-label">종료 시간</label>
          <input class="hs-modal-input" id="hsModalEnd" placeholder="16:00" />
        </div>
      </div>
      <div class="hs-modal-field">
        <label class="hs-modal-label">메모 <span style="opacity:0.4">(선택)</span></label>
        <textarea class="hs-modal-ta" id="hsModalMemo" placeholder="메모를 남겨보세요..."></textarea>
      </div>
      <div class="hs-modal-actions">
        <button class="hs-modal-btn-cancel" id="hsModalCancel">취소</button>
        <button class="hs-modal-btn-save" id="hsModalSave">저장하기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderTags() {
    const wrap = document.getElementById("hsModalTags");
    if (!wrap) return;
    wrap.innerHTML = "";
    userTags.forEach(tag => {
      const sel = selectedTagIds.includes(tag.id);
      const chip = document.createElement("span");
      chip.className = "hs-modal-tag" + (sel ? " selected" : "");
      chip.style.cssText = `--tc:${tag.color}`;
      chip.textContent = tag.name;
      chip.addEventListener("click", () => {
        selectedTagIds = sel ? selectedTagIds.filter(id => id !== tag.id) : [...selectedTagIds, tag.id];
        renderTags();
      });
      wrap.appendChild(chip);
    });
    const addTagBtn = document.createElement("span");
    addTagBtn.className = "hs-modal-tag-add";
    addTagBtn.textContent = "+ 추가";
    addTagBtn.addEventListener("click", () => {
      if (wrap.querySelector(".hs-new-tag-inp")) return;
      const inp = document.createElement("input");
      inp.className = "hs-new-tag-inp";
      inp.placeholder = "태그 이름";
      const confirm = () => {
        const name = inp.value.trim();
        if (name) { const t = addUserTag(name); if (t) selectedTagIds.push(t.id); }
        renderTags();
      };
      inp.addEventListener("keydown", e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") renderTags(); });
      inp.addEventListener("blur", confirm);
      wrap.appendChild(inp);
      inp.focus();
    });
    wrap.appendChild(addTagBtn);
  }
  renderTags();

  const close = () => overlay.remove();
  document.getElementById("hsModalClose").addEventListener("click", close);
  document.getElementById("hsModalCancel").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  document.getElementById("hsModalSave").addEventListener("click", async () => {
    const text = document.getElementById("hsModalText").value.trim();
    if (!text) return;
    const startP = parseHM(document.getElementById("hsModalStart").value);
    const endP = parseHM(document.getElementById("hsModalEnd").value);
    let timeMs = Date.now(), endMs = null, durationMs = null;
    if (startP) { const d = new Date(dayStart); d.setHours(startP.h, startP.min, 0, 0); timeMs = d.getTime(); }
    if (endP) { const d = new Date(dayStart); d.setHours(endP.h, endP.min, 0, 0); endMs = d.getTime(); durationMs = endMs - timeMs; }
    const newEntry = { label: formatClock(new Date(timeMs)), text, timeMs, endMs, durationMs, tags: [...selectedTagIds], isLive: false };
    let targetRecord = records[records.length - 1];
    if (!targetRecord && currentUser) {
      const newRecord = { date: dateStr, startMs: timeMs, endMs: endMs || timeMs, durationMs: durationMs || 0, checkIns: [newEntry], retro: "" };
      const ref = await db.collection("users").doc(currentUser.uid).collection("history").add(newRecord);
      newRecord._id = ref.id;
      records.push(newRecord);
    } else if (targetRecord) {
      targetRecord.checkIns = targetRecord.checkIns || [];
      targetRecord.checkIns.push(newEntry);
      await updateRecord(targetRecord._id, { checkIns: targetRecord.checkIns });
    }
    close();
    renderDayContent(container, records, dateStr);
  });

  document.getElementById("hsModalText").focus();
}

function showEditRecordModal(c, records, dateStr, container) {
  document.getElementById("hsEditModal")?.remove();
  let selectedTagIds = [...(c.tags || [])];
  const dayStart = new Date(dateStr + "T00:00:00").getTime();
  const parseHM = str => {
    if (!str) return null; str = str.trim();
    let m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return { h: parseInt(m[1]), min: parseInt(m[2]) };
    m = str.match(/^(\d{1,2})시(\d{2})?분?$/);
    if (m) return { h: parseInt(m[1]), min: m[2] ? parseInt(m[2]) : 0 };
    return null;
  };
  const toHHMM = ms => ms ? `${String(new Date(ms).getHours()).padStart(2,"0")}:${String(new Date(ms).getMinutes()).padStart(2,"0")}` : "";

  const overlay = document.createElement("div");
  overlay.className = "hs-modal-overlay";
  overlay.id = "hsEditModal";
  overlay.innerHTML = `
    <div class="hs-modal">
      <div class="hs-modal-header">
        <span class="hs-modal-title">기록 수정</span>
        <button class="hs-modal-close" id="hsEditClose">×</button>
      </div>
      <div class="hs-modal-field">
        <label class="hs-modal-label">활동명</label>
        <input class="hs-modal-input" id="hsEditText" value="${c.text || ""}" />
      </div>
      <div class="hs-modal-field">
        <label class="hs-modal-label">카테고리</label>
        <div class="hs-modal-tags" id="hsEditTags"></div>
      </div>
      <div class="hs-modal-time-row">
        <div class="hs-modal-field">
          <label class="hs-modal-label">시작 시간</label>
          <input class="hs-modal-input" id="hsEditStart" value="${toHHMM(c.timeMs)}" placeholder="14:00" />
        </div>
        <div class="hs-modal-field">
          <label class="hs-modal-label">종료 시간</label>
          <input class="hs-modal-input" id="hsEditEnd" value="${toHHMM(c.endMs)}" placeholder="16:00" />
        </div>
      </div>
      <div class="hs-modal-actions">
        <button class="hs-modal-btn-cancel" id="hsEditCancel">취소</button>
        <button class="hs-modal-btn-save" id="hsEditSave">저장하기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderTags() {
    const wrap = document.getElementById("hsEditTags"); if (!wrap) return;
    wrap.innerHTML = "";
    userTags.forEach(tag => {
      const sel = selectedTagIds.includes(tag.id);
      const chip = document.createElement("span");
      chip.className = "hs-modal-tag" + (sel ? " selected" : "");
      chip.style.cssText = `--tc:${tag.color}`;
      chip.textContent = tag.name;
      chip.addEventListener("click", () => {
        selectedTagIds = sel ? selectedTagIds.filter(id => id !== tag.id) : [...selectedTagIds, tag.id];
        renderTags();
      });
      wrap.appendChild(chip);
    });
    const addTagBtn = document.createElement("span");
    addTagBtn.className = "hs-modal-tag-add";
    addTagBtn.textContent = "+ 추가";
    addTagBtn.addEventListener("click", () => {
      if (wrap.querySelector(".hs-new-tag-inp")) return;
      const inp = document.createElement("input");
      inp.className = "hs-new-tag-inp";
      inp.placeholder = "태그 이름";
      const confirmTag = () => { const name = inp.value.trim(); if (name) { const t = addUserTag(name); if (t) selectedTagIds.push(t.id); } renderTags(); };
      inp.addEventListener("keydown", e => { if (e.key === "Enter") confirmTag(); if (e.key === "Escape") renderTags(); });
      inp.addEventListener("blur", confirmTag);
      wrap.appendChild(inp); inp.focus();
    });
    wrap.appendChild(addTagBtn);
  }
  renderTags();

  const close = () => overlay.remove();
  document.getElementById("hsEditClose").addEventListener("click", close);
  document.getElementById("hsEditCancel").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  document.getElementById("hsEditSave").addEventListener("click", async () => {
    const text = document.getElementById("hsEditText").value.trim();
    if (!text) return;
    const startP = parseHM(document.getElementById("hsEditStart").value);
    const endP = parseHM(document.getElementById("hsEditEnd").value);
    let timeMs = c.timeMs || Date.now(), endMs = c.endMs || null, durationMs = c.durationMs || null;
    if (startP) { const d = new Date(dayStart); d.setHours(startP.h, startP.min, 0, 0); timeMs = d.getTime(); }
    if (endP) { const d = new Date(dayStart); d.setHours(endP.h, endP.min, 0, 0); endMs = d.getTime(); durationMs = endMs - timeMs; }
    c._record.checkIns[c._idx] = { ...c._record.checkIns[c._idx], text, timeMs, endMs, durationMs, tags: [...selectedTagIds] };
    await updateRecord(c._record._id, { checkIns: c._record.checkIns });
    close();
    renderDayContent(container, records, dateStr);
  });

  document.getElementById("hsEditText").focus();
}

function updateFocusScreen() {
  if (!startedAtMs) return;
  const nowMs = isPaused ? pausedAt : Date.now();
  const focusToday = document.getElementById("focusTodayText");
  if (focusToday) focusToday.textContent = formatDate();
  const elMs = nowMs - startedAtMs - totalPausedMs;
  const elTotalSec = Math.max(0, Math.floor(elMs / 1000));
  const elH = Math.floor(elTotalSec / 3600);
  const elM = Math.floor((elTotalSec % 3600) / 60);
  const elS = elTotalSec % 60;
  const liveTimeText = `${elH}시간 ${String(elM).padStart(2,"0")}분 ${String(elS).padStart(2,"0")}초`;
  els.elapsedTimeText.textContent = liveTimeText;
  if (els.summaryFocusText) els.summaryFocusText.textContent = liveTimeText;
  els.startedMetaText.textContent = `${formatClock(new Date(startedAtMs))} 시작했어요`;
  updateCheckinNext();
  renderLiveSegments();
  renderTrackerSummary();
  maybeTriggerBounce();
  // 현재 태스크 라이브 타이머
  const liveTaskEl = document.getElementById("current-task-time");
  if (liveTaskEl && checkIns.length > 0) {
    const liveTask = checkIns.find(c => c.isLive && !c.endMs);
    if (liveTask) liveTaskEl.textContent = fmtDur(nowMs - liveTask.timeMs);
  }
  // 집중 모드 오버레이 동기화
  const focusOverlay = document.getElementById("focusOverlay");
  if (focusOverlay && !focusOverlay.classList.contains("hidden")) {
    const elText = document.getElementById("focusElapsedText");
    if (elText) elText.textContent = liveTimeText;
    const metaEl = document.getElementById("focusMetaText");
    if (metaEl) metaEl.textContent = `${formatClock(new Date(startedAtMs))} 시작했어요`;
    const todayEl = document.getElementById("focusTodayText2");
    if (todayEl) todayEl.textContent = formatDate();
  }
}

function pauseSession() {
  if (!startedAtMs || isPaused) return;
  isPaused = true;
  pausedAt = Date.now();
  clearInterval(timerId);
  timerId = null;
  els.sessionBadge.textContent = "일시정지";
  if (els.pauseButton) { els.pauseButton.textContent = "재개하기"; }
  const focusPauseBtn = document.getElementById("focusPauseBtn");
  if (focusPauseBtn) focusPauseBtn.textContent = "재개하기";
  updateFocusScreen();
}

function resumeSession() {
  if (!startedAtMs || !isPaused) return;
  totalPausedMs += Date.now() - pausedAt;
  isPaused = false;
  pausedAt = null;
  els.sessionBadge.textContent = "작업 기록 중";
  if (els.pauseButton) { els.pauseButton.textContent = "일시정지"; }
  const focusPauseBtn2 = document.getElementById("focusPauseBtn");
  if (focusPauseBtn2) focusPauseBtn2.textContent = "일시정지";
  if (timerId) clearInterval(timerId);
  timerId = setInterval(updateFocusScreen, 1000);
  updateFocusScreen();
}

function startSession() {
  requestNotificationPermission();
  startedAtMs = Date.now();
  endedAtMs = null;
  lastSessionMs = 0;
  isPaused = false;
  pausedAt = null;
  totalPausedMs = 0;
  initCheckin();
  saveState();
  els.sessionBadge.textContent = "작업 기록 중";
  if (els.pauseButton) els.pauseButton.textContent = "일시정지";
  const focusPauseBtn = document.getElementById("focusPauseBtn");
  if (focusPauseBtn) focusPauseBtn.textContent = "일시정지";
  // Show active state in left panel
  document.getElementById("wsIdleState")?.classList.add("hidden");
  document.getElementById("wsActiveState")?.classList.remove("hidden");
  // Scroll to workspace
  document.getElementById("workspaceSection")
    ?.scrollIntoView({ behavior: "smooth" });
  updateFocusScreen();
  if (timerId) clearInterval(timerId);
  timerId = setInterval(updateFocusScreen, 1000);
}

function openRetroModal() {
  if (!els.retroModal) return;
  if (els.retroModalTextarea) els.retroModalTextarea.value = "";
  els.retroModal.classList.remove("hidden");
  setTimeout(() => els.retroModalTextarea?.focus(), 100);
}

function closeRetroModal() {
  if (els.retroModal) els.retroModal.classList.add("hidden");
}

function finishSession(retro = "") {
  if (els.summaryRetro) els.summaryRetro.value = retro;
  closeRetroModal();
  if (timerId) clearInterval(timerId);
  timerId = null;
  els.sessionBadge.textContent = "대기";
  // Hide focus overlay if open
  document.getElementById("focusOverlay")?.classList.add("hidden");
  // Show idle state in left panel
  document.getElementById("wsIdleState")?.classList.remove("hidden");
  document.getElementById("wsActiveState")?.classList.add("hidden");
  openSummaryScreen();
}

function endSession() {
  if (!startedAtMs) return;
  if (isPaused) resumeSession();
  endedAtMs = Date.now();
  const elapsed = endedAtMs - startedAtMs - totalPausedMs;
  lastSessionMs = elapsed;
  startedAtMs = null;
  isPaused = false;
  pausedAt = null;
  totalPausedMs = 0;
  saveState();
  openRetroModal();
}

window.openTlEdit = function(idx) {
  const row = els.timelineWrap.querySelector(`[data-checkin-idx="${idx}"]`);
  if (!row) return;
  const wrap = row.querySelector(".tl-edit-wrap");
  const current = checkIns[idx].text || "";
  wrap.innerHTML = `
    <textarea class="tl-edit-textarea" rows="2">${current === "(기록 없음)" ? "" : current}</textarea>
    <div class="tl-edit-actions">
      <button class="tl-save-btn" onclick="saveTlEdit(${idx})">저장</button>
      <button class="tl-cancel-btn" onclick="openSummaryScreen()">취소</button>
    </div>
  `;
  wrap.querySelector("textarea").focus();
};

window.saveTlEdit = function(idx) {
  const row = els.timelineWrap.querySelector(`[data-checkin-idx="${idx}"]`);
  if (!row) return;
  const val = row.querySelector("textarea").value.trim();
  checkIns[idx].text = val || "(기록 없음)";
  openSummaryScreen();
};

function renderTimeline(startMs, endMs) {
  if (!els.timelineWrap) return;

  const rows = [];

  rows.push(`
    <div class="tl-row tl-row--start">
      <div class="tl-dot tl-dot--start"></div>
      <div class="tl-content">
        <span class="tl-time">${formatClock(new Date(startMs))}</span>
        <span class="tl-label">작업 시작</span>
      </div>
    </div>
  `);

  checkIns.forEach((c, idx) => {
    const skipped = c.text === null || c.text === "(기록 없음)";
    rows.push(`
      <div class="tl-row${skipped ? " tl-row--skip" : ""}" data-checkin-idx="${idx}">
        <div class="tl-dot"></div>
        <div class="tl-content">
          <span class="tl-time">${formatClock(new Date(c.timeMs))}</span>
          <span class="tl-label">${c.label}</span>
          <div class="tl-edit-wrap">
            ${!skipped ? `<p class="tl-text">${c.text}</p>` : `<p class="tl-text tl-text--empty">(기록 없음)</p>`}
            <button class="tl-edit-btn" onclick="openTlEdit(${idx})">수정</button>
          </div>
        </div>
      </div>
    `);
  });

  if (endMs) {
    rows.push(`
      <div class="tl-row tl-row--end">
        <div class="tl-dot tl-dot--end"></div>
        <div class="tl-content">
          <span class="tl-time">${formatClock(new Date(endMs))}</span>
          <span class="tl-label">마무리</span>
        </div>
      </div>
    `);
  }

  els.timelineWrap.innerHTML = `
    <div class="tl-header">작업 타임라인</div>
    <div class="tl-list">${rows.join("")}</div>
  `;
}

function renderSummaryScreen() {
  els.summaryDateText.textContent = formatDate();
  if (startedAtMs) {
    const elMs = Date.now() - startedAtMs;
    const elTotalSec = Math.max(0, Math.floor(elMs / 1000));
    const elH = Math.floor(elTotalSec / 3600);
    const elM = Math.floor((elTotalSec % 3600) / 60);
    const elS = elTotalSec % 60;
    els.summaryFocusText.textContent = `${elH}시간 ${String(elM).padStart(2,"0")}분 ${String(elS).padStart(2,"0")}초`;
  } else {
    els.summaryFocusText.textContent = formatDuration(lastSessionMs || 0);
  }

  const sessionStart = endedAtMs ? endedAtMs - lastSessionMs : Date.now() - lastSessionMs;
  renderTimeline(sessionStart, endedAtMs);
}

function openSummaryScreen() {
  renderSummaryScreen();
  showScreen("summary");
}

function init() {
  loadTags();
  // Firebase 인증 상태 감지
  auth.onAuthStateChanged((user) => {
    currentUser = user;

    if (!user) {
      // 로그인 안 됨 → 로그인 화면
      showScreen("login");
      return;
    }

    // 로그인 됨 → 기존 초기화
    restoreState();
    if (els.todayText) els.todayText.textContent = formatDate();

    // 앱 메인 표시
    document.getElementById("loginScreen")?.classList.remove("is-active");
    document.getElementById("appMain")?.classList.remove("hidden");

    if (startedAtMs) {
      document.getElementById("wsIdleState")?.classList.add("hidden");
      document.getElementById("wsActiveState")?.classList.remove("hidden");
      els.sessionBadge.textContent = "작업 기록 중";
      updateFocusScreen();
      timerId = setInterval(updateFocusScreen, 1000);
    } else {
      document.getElementById("wsIdleState")?.classList.remove("hidden");
      document.getElementById("wsActiveState")?.classList.add("hidden");
      els.sessionBadge.textContent = "대기";
    }

    updateWelcomeScreen();
    // 우측 패널에 기록 자동 로드
    renderHistoryScreen();
  });

  setInterval(() => {
    if (els.todayText) els.todayText.textContent = formatDate();
    updateWelcomeScreen();
  }, 30000);

  // Google 로그인 버튼
  els.googleLoginBtn?.addEventListener("click", signInWithGoogle);

  els.startButton?.addEventListener("click", startSession);
  $("goalAddBtn")?.addEventListener("click", addGoalTask);
  $("goalStartTime")?.addEventListener("input", updateGoalTotal);
  $("goalModalClose")?.addEventListener("click", closeGoalModal);
  $("goalSaveBtn")?.addEventListener("click", closeGoalModal);
  els.pauseButton?.addEventListener("click", () => {
    if (isPaused) resumeSession(); else pauseSession();
  });
  els.endButton?.addEventListener("click", endSession);

  // 집중 모드 오버레이 버튼
  document.getElementById("wsExpandBtn")?.addEventListener("click", () => {
    const overlay = document.getElementById("focusOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    // 즉시 동기화
    const elText = document.getElementById("focusElapsedText");
    if (elText && els.elapsedTimeText) elText.textContent = els.elapsedTimeText.textContent;
    const metaEl = document.getElementById("focusMetaText");
    if (metaEl && els.startedMetaText) metaEl.textContent = els.startedMetaText.textContent;
    const todayEl = document.getElementById("focusTodayText2");
    if (todayEl) todayEl.textContent = formatDate();
    const focusTodayEl = document.getElementById("focusTodayText");
    if (focusTodayEl) todayEl.textContent = focusTodayEl.textContent;
  });
  document.getElementById("focusCollapseBtn")?.addEventListener("click", () => {
    document.getElementById("focusOverlay")?.classList.add("hidden");
  });
  document.getElementById("focusPauseBtn")?.addEventListener("click", () => {
    if (isPaused) resumeSession(); else pauseSession();
  });
  document.getElementById("focusEndBtn")?.addEventListener("click", endSession);

  els.summaryBackButton?.addEventListener("click", () => {
    // 요약 닫기, 작업 중이면 왼쪽 패널 유지
    document.getElementById("summaryScreen")?.classList.add("hidden");
    if (startedAtMs) {
      document.getElementById("workspaceSection")
        ?.scrollIntoView({ behavior: "smooth" });
    }
  });
  els.summarySaveButton?.addEventListener("click", async () => {
    await saveSessionToHistory();
    document.getElementById("summaryScreen")?.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderHistoryScreen();
  });

  els.retroSaveBtn?.addEventListener("click", () => {
    const retro = els.retroModalTextarea?.value.trim() || "";
    finishSession(retro);
  });
  els.retroSkipBtn?.addEventListener("click", () => finishSession(""));
  els.retroModalTextarea?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      const retro = els.retroModalTextarea.value.trim();
      finishSession(retro);
    }
  });

  els.historyLinkButton?.addEventListener("click", () => {
    document.getElementById("workspaceSection")
      ?.scrollIntoView({ behavior: "smooth" });
  });

  // historyBackButton removed from new layout — no-op

  // 음악 버튼
  const musicBtn = document.getElementById("musicBtn");
  const musicFrame = document.getElementById("musicFrame");
  let musicPlaying = false;
  const hour = new Date().getHours();
  const isDawn = hour >= 0 && hour < 6; // 새벽 0~5시

  // 새벽: welcome 화면 배경 영상을 드라이브 영상으로 교체
  if (isDawn) {
    document.querySelectorAll(".welcome-bg-video").forEach(v => {
      v.src = "./dawn-drive.mp4";
      v.load();
      v.play().catch(() => {});
    });
  }

  musicBtn?.addEventListener("click", () => {
    if (!musicPlaying) {
      const MUSIC_ID = isDawn ? "aB2z36lEJ_E" : "46e80ussWc0";
      const MUSIC_SRC = `https://www.youtube.com/embed/${MUSIC_ID}?autoplay=1&loop=1&playlist=${MUSIC_ID}&enablejsapi=1`;
      const newFrame = document.createElement("iframe");
      newFrame.id = "musicFrame";
      newFrame.src = MUSIC_SRC;
      newFrame.style.cssText = musicFrame.style.cssText;
      newFrame.frameBorder = "0";
      newFrame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      newFrame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      newFrame.allowFullscreen = true;
      musicFrame.replaceWith(newFrame);
      musicBtn.classList.add("is-playing");
      musicBtn.title = "음악 정지";
      musicPlaying = true;
    } else {
      const frame = document.getElementById("musicFrame");
      if (frame) frame.src = "";
      musicBtn.classList.remove("is-playing");
      musicBtn.title = "음악 재생";
      musicPlaying = false;
    }
  });

  // 피드백 버튼
  const feedbackBtn = document.getElementById("feedbackBtn");
  const feedbackModal = document.getElementById("feedbackModal");
  const feedbackClose = document.getElementById("feedbackModalClose");
  const feedbackSend = document.getElementById("feedbackSendBtn");
  const feedbackTextarea = document.getElementById("feedbackTextarea");

  const openFeedback = () => {
    feedbackModal?.classList.remove("hidden");
    feedbackTextarea?.focus();
  };
  const closeFeedback = () => {
    feedbackModal?.classList.add("hidden");
  };

  feedbackBtn?.addEventListener("click", openFeedback);
  feedbackClose?.addEventListener("click", closeFeedback);
  feedbackModal?.addEventListener("click", (e) => {
    if (e.target === feedbackModal) closeFeedback();
  });
  feedbackSend?.addEventListener("click", async () => {
    const text = feedbackTextarea?.value?.trim();
    if (!text) return;

    feedbackSend.disabled = true;
    feedbackSend.textContent = "보내는 중...";

    try {
      const res = await fetch("https://formspree.io/f/mpqgglnl", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          message: text,
          from: currentUser?.email || "anonymous",
        }),
      });
      if (!res.ok) throw new Error("formspree error");
      feedbackTextarea.value = "";
      feedbackSend.textContent = "보냈어요 ✓";
      setTimeout(() => {
        closeFeedback();
        feedbackSend.textContent = "보내기";
        feedbackSend.disabled = false;
      }, 1200);
    } catch (e) {
      console.error("피드백 저장 실패:", e);
      feedbackSend.textContent = "실패 :(";
      feedbackSend.disabled = false;
      setTimeout(() => { feedbackSend.textContent = "보내기"; }, 2000);
    }
  });

}

init();
