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

function saveCheckin() {
  const text = els.checkinTextarea.value.trim();
  if (!text) return;
  const now = Date.now();
  // 이전 태스크 시간 확정
  if (checkIns.length > 0) {
    const last = checkIns[checkIns.length - 1];
    if (!last.endMs) {
      last.endMs = now;
      last.durationMs = now - last.timeMs;
    }
  }
  // 새 태스크 시작
  checkIns.push({ timeMs: now, label: formatClock(new Date()), text, endMs: null, durationMs: null });
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
    const isActive = idx === checkIns.length - 1 && !c.endMs;
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
  els.loginScreen.classList.toggle("is-active", screen === "login");
  els.welcomeScreen.classList.toggle("is-active", screen === "welcome");
  els.focusScreen.classList.toggle("is-active", screen === "focus");
  els.summaryScreen.classList.toggle("is-active", screen === "summary");
  els.historyScreen.classList.toggle("is-active", screen === "history");
  const feedbackBtn = document.getElementById("feedbackBtn");
  if (feedbackBtn) feedbackBtn.style.display = screen === "welcome" ? "" : "none";
  const endBtn = document.getElementById("endButtonFixed");
  if (endBtn) endBtn.classList.toggle("visible", screen === "focus");
  const homeBtn = document.getElementById("homeBtn");
  if (homeBtn) homeBtn.classList.toggle("visible", screen === "focus");
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
  // 마지막 태스크 시간 확정
  if (checkIns.length > 0) {
    const last = checkIns[checkIns.length - 1];
    if (!last.endMs) {
      last.endMs = endedAtMs || Date.now();
      last.durationMs = last.endMs - last.timeMs;
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

async function renderHistoryScreen() {
  if (!els.historyWeekTotal || !els.historyList) return;

  els.historyWeekTotal.innerHTML = `
    <div class="history-tabs">
      <button class="history-tab ${historyTab === 'week' ? 'is-active' : ''}" data-tab="week">이번 주</button>
      <button class="history-tab ${historyTab === 'month' ? 'is-active' : ''}" data-tab="month">이번 달</button>
    </div>
  `;
  els.historyWeekTotal.querySelectorAll(".history-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      historyTab = btn.dataset.tab;
      renderHistoryScreen();
    });
  });

  els.historyList.innerHTML = `<p style="opacity:0.4;text-align:center;padding:24px;">불러오는 중...</p>`;
  const history = (await getHistory()).filter(r => r.type !== "feedback");

  if (historyTab === "week") renderWeekView(history);
  else renderMonthView(history);
}

function renderWeekView(history) {
  const { mon, sun } = getWeekRange();
  const DAYS = ["월","화","수","목","금","토","일"];

  const weekRecords = history.filter(r => {
    const d = new Date(r.startMs);
    return d >= mon && d <= sun;
  });
  const byDate = {};
  weekRecords.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });
  const weekTotalMs = weekRecords.reduce((s, r) => s + (r.durationMs || 0), 0);
  const wh = Math.floor(weekTotalMs / 3600000);
  const wm = Math.floor((weekTotalMs % 3600000) / 60000);

  const totalEl = document.createElement("p");
  totalEl.className = "history-period-total";
  totalEl.textContent = weekTotalMs > 0 ? `총 ${wh > 0 ? wh + "시간 " : ""}${wm}분` : "기록 없음";
  els.historyList.innerHTML = "";
  els.historyList.appendChild(totalEl);

  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const dateStr = toDateStr(d.getTime());
    const dayRecords = byDate[dateStr] || [];
    const dayTotalMs = dayRecords.reduce((s, r) => s + (r.durationMs || 0), 0);
    const isToday = dateStr === toDateStr(Date.now());
    const hasData = dayRecords.length > 0;

    const row = document.createElement("div");
    row.className = "history-day-row" + (isToday ? " history-day-row--today" : "") + (!hasData ? " history-day-row--empty" : "");

    const dayH = Math.floor(dayTotalMs / 3600000);
    const dayM = Math.floor((dayTotalMs % 3600000) / 60000);
    const timeStr = hasData ? (dayH > 0 ? `${dayH}시간 ${dayM}분` : `${dayM}분`) : "—";

    row.innerHTML = `
      <span class="history-day-name">${DAYS[i]}</span>
      <span class="history-day-date">${d.getMonth()+1}/${d.getDate()}</span>
      <span class="history-day-time">${timeStr}</span>
      <span class="history-day-arrow">›</span>
    `;
    row.style.cursor = "pointer";
    row.addEventListener("click", () => toggleDayDetail(row, dayRecords, dateStr));
    els.historyList.appendChild(row);
  }

  const olderRecords = history.filter(r => new Date(r.startMs) < mon);
  if (olderRecords.length > 0) {
    const sep = document.createElement("p");
    sep.className = "history-section-label";
    sep.textContent = "이전 기록";
    els.historyList.appendChild(sep);

    const olderByDate = {};
    olderRecords.forEach(r => {
      if (!olderByDate[r.date]) olderByDate[r.date] = [];
      olderByDate[r.date].push(r);
    });

    Object.entries(olderByDate).sort((a,b) => b[0].localeCompare(a[0])).forEach(([date, recs]) => {
      const d = new Date(date);
      const totalMs = recs.reduce((s,r) => s + (r.durationMs||0), 0);
      const h = Math.floor(totalMs/3600000), m = Math.floor((totalMs%3600000)/60000);
      const row = document.createElement("div");
      row.className = "history-day-row";
      row.style.cursor = "pointer";
      row.innerHTML = `
        <span class="history-day-name">${WEEKDAYS[d.getDay()]}</span>
        <span class="history-day-date">${d.getMonth()+1}/${d.getDate()}</span>
        <span class="history-day-time">${h > 0 ? h+"시간 "+m+"분" : m+"분"}</span>
        <span class="history-day-arrow">›</span>
      `;
      row.addEventListener("click", () => toggleDayDetail(row, recs, date));
      els.historyList.appendChild(row);
    });
  }
}

function renderMonthView(history) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const daysInMonth = monthEnd.getDate();

  const monthRecords = history.filter(r => {
    const d = new Date(r.startMs);
    return d >= monthStart && d <= monthEnd;
  });

  const byDate = {};
  monthRecords.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  const monthTotalMs = monthRecords.reduce((s, r) => s + (r.durationMs || 0), 0);
  const mh = Math.floor(monthTotalMs / 3600000);
  const mm = Math.floor((monthTotalMs % 3600000) / 60000);

  els.historyList.innerHTML = "";

  // 월 총합
  const totalEl = document.createElement("p");
  totalEl.className = "history-period-total";
  totalEl.textContent = monthTotalMs > 0 ? `총 ${mh > 0 ? mh + "시간 " : ""}${mm}분` : "기록 없음";
  els.historyList.appendChild(totalEl);

  // 월 표시
  const monthLabel = document.createElement("p");
  monthLabel.className = "cal-month-label";
  monthLabel.textContent = `${month + 1}월`;
  els.historyList.appendChild(monthLabel);

  // 캘린더 그리드
  const cal = document.createElement("div");
  cal.className = "cal-grid";

  // 요일 헤더 (일 월 화 수 목 금 토)
  const DAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];
  DAY_HEADERS.forEach(d => {
    const h = document.createElement("div");
    h.className = "cal-header";
    h.textContent = d;
    cal.appendChild(h);
  });

  // 첫째 날 앞 빈칸
  const firstDow = monthStart.getDay(); // 0=일
  for (let i = 0; i < firstDow; i++) {
    cal.appendChild(document.createElement("div"));
  }

  // 날짜 셀
  const todayStr = toDateStr(Date.now());
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dateStr = toDateStr(d.getTime());
    const recs = byDate[dateStr] || [];
    const totalMs = recs.reduce((s, r) => s + (r.durationMs || 0), 0);
    const hasData = totalMs > 0;
    const isToday = dateStr === todayStr;
    const isFuture = d > now && !isToday;

    const cell = document.createElement("div");
    cell.className = "cal-cell" +
      (isToday ? " cal-cell--today" : "") +
      (isFuture ? " cal-cell--future" : "") +
      (hasData ? " cal-cell--has-data" : "");

    const dayNum = document.createElement("span");
    dayNum.className = "cal-cell__day";
    dayNum.textContent = day;
    cell.appendChild(dayNum);

    if (hasData) {
      const h = Math.floor(totalMs / 3600000);
      const m = Math.floor((totalMs % 3600000) / 60000);
      const timeEl = document.createElement("span");
      timeEl.className = "cal-cell__time";
      timeEl.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
      cell.appendChild(timeEl);

      // 강도 표시 (최대 4시간 기준)
      const intensity = Math.min(totalMs / (4 * 3600000), 1);
      cell.style.setProperty("--cal-intensity", intensity);
      cell.style.cursor = "pointer";
      cell.addEventListener("click", () => showCalDayDetail(recs, dateStr, d));
    }

    cal.appendChild(cell);
  }

  els.historyList.appendChild(cal);

  // 날짜 클릭 시 상세 패널
  const detailPanel = document.createElement("div");
  detailPanel.className = "cal-detail-panel";
  detailPanel.id = "calDetailPanel";
  els.historyList.appendChild(detailPanel);
}

function showCalDayDetail(records, dateStr, d) {
  const panel = document.getElementById("calDetailPanel");
  if (!panel) return;

  // 같은 날 다시 클릭하면 닫기
  if (panel.dataset.date === dateStr && panel.style.display !== "none" && panel.innerHTML !== "") {
    panel.innerHTML = "";
    panel.dataset.date = "";
    document.querySelectorAll(".cal-cell--selected").forEach(c => c.classList.remove("cal-cell--selected"));
    return;
  }

  document.querySelectorAll(".cal-cell--selected").forEach(c => c.classList.remove("cal-cell--selected"));
  document.querySelectorAll(".cal-cell--has-data").forEach(c => {
    const day = parseInt(c.querySelector(".cal-cell__day")?.textContent);
    if (day === d.getDate()) c.classList.add("cal-cell--selected");
  });

  panel.dataset.date = dateStr;

  const totalMs = records.reduce((s, r) => s + (r.durationMs || 0), 0);
  const th = Math.floor(totalMs / 3600000);
  const tm = Math.floor((totalMs % 3600000) / 60000);
  const timeStr = th > 0 ? `${th}시간 ${tm}분` : `${tm}분`;

  panel.innerHTML = `
    <div class="cal-detail__header">
      <span class="cal-detail__date">${d.getMonth()+1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일</span>
      <span class="cal-detail__total">${timeStr}</span>
    </div>
    <div class="cal-detail__sessions">
      ${records.filter(r => r.durationMs >= 60000).map(r => {
        const sh = Math.floor(r.durationMs / 3600000);
        const sm = Math.floor((r.durationMs % 3600000) / 60000);
        const start = new Date(r.startMs);
        const ampm = start.getHours() < 12 ? "오전" : "오후";
        const h12 = start.getHours() % 12 || 12;
        const minStr = String(start.getMinutes()).padStart(2, "0");
        return `<div class="cal-detail__session">
          <span class="cal-detail__session-time">${ampm} ${h12}:${minStr}</span>
          <span class="cal-detail__session-dur">${sh > 0 ? sh+"시간 "+sm+"분" : sm+"분"}</span>
        </div>`;
      }).join("")}
    </div>
  `;
}

function toggleDayDetail(row, records, date) {
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains("history-detail")) {
    existing.remove();
    row.querySelector(".history-day-arrow")?.classList.remove("is-open");
    return;
  }
  row.querySelector(".history-day-arrow")?.classList.add("is-open");

  const detail = document.createElement("div");
  detail.className = "history-detail";
  renderDetailContent(detail, records, date);
  row.after(detail);
}

// 세션을 시간 근접도로 그룹핑 (gap > 2시간이면 다른 그룹)
function groupByProximity(sessions, gapMs = 2 * 60 * 60 * 1000) {
  if (!sessions.length) return [];
  const sorted = [...sessions].sort((a, b) => a.startMs - b.startMs);
  const groups = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.startMs - prev.endMs <= gapMs) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }
  return groups;
}

function renderDetailContent(container, records, dateStr) {
  const valid = records.filter(r => r.durationMs >= 60000);
  container.innerHTML = "";

  // ── 기록 없는 날: 빈 세션 만들고 기록 추가 ──
  if (records.length === 0) {
    const emptyWrap = document.createElement("div");
    emptyWrap.style.cssText = "padding:4px 0 8px;";
    const addBtn = document.createElement("button");
    addBtn.className = "hd-edit-btn";
    addBtn.textContent = "+ 기록 추가";
    addBtn.addEventListener("click", () => {
      if (emptyWrap.querySelector(".hd-add-form")) return;
      addBtn.style.display = "none";
      const form = document.createElement("div");
      form.className = "hd-add-form";
      const ta = document.createElement("textarea");
      ta.className = "checkin-textarea";
      ta.placeholder = "어떤 작업을 했나요?";
      ta.style.cssText = "width:100%;margin-top:6px;";
      const actions = document.createElement("div");
      actions.className = "checkin-input-actions";
      actions.style.marginTop = "6px";
      const saveBtn = document.createElement("button");
      saveBtn.className = "checkin-save-btn";
      saveBtn.textContent = "저장";
      saveBtn.addEventListener("click", async () => {
        const text = ta.value.trim();
        if (!text) return;
        const targetDate = dateStr || toDateStr(Date.now());
        const now = Date.now();
        const newRecord = {
          date: targetDate,
          startMs: now,
          endMs: now,
          durationMs: 0,
          checkIns: [{ label: formatClock(new Date()), text, timeMs: now }],
          retro: ""
        };
        if (currentUser) {
          const ref = await db.collection("users").doc(currentUser.uid)
            .collection("history").add(newRecord);
          newRecord._id = ref.id;
        }
        records.push(newRecord);
        renderDetailContent(container, records, dateStr);
      });
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "checkin-cancel-btn";
      cancelBtn.textContent = "취소";
      cancelBtn.addEventListener("click", () => { form.remove(); addBtn.style.display = ""; });
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
      form.appendChild(ta);
      form.appendChild(actions);
      emptyWrap.appendChild(form);
      ta.focus();
    });
    emptyWrap.appendChild(addBtn);
    container.appendChild(emptyWrap);
    return;
  }

  // ── 시간 근접 세션 그룹핑 (2시간 이상 간격이면 별도 블록) ──
  const groups = groupByProximity(valid);

  // 그룹별 회고 렌더 헬퍼
  function buildRetroWrap(retroRecord, wrap) {
    const btn = document.createElement("button");
    btn.className = "hd-edit-btn";
    btn.textContent = retroRecord.retro ? "회고 수정" : "+ 회고 추가";

    const openEdit = () => {
      if (wrap.querySelector(".hd-inline-edit")) return;
      const banner = wrap.querySelector(".hd-retro-banner");
      if (banner) banner.style.display = "none";
      btn.style.display = "none";
      const ta = document.createElement("textarea");
      ta.className = "hd-inline-edit";
      ta.value = retroRecord.retro || "";
      ta.placeholder = "이 세션 회고를 적어주세요";
      const saveBtn = document.createElement("button");
      saveBtn.className = "hd-save-btn";
      saveBtn.textContent = "저장";
      saveBtn.addEventListener("click", async () => {
        retroRecord.retro = ta.value.trim();
        await updateRecord(retroRecord._id, { retro: retroRecord.retro });
        renderDetailContent(container, records);
      });
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "hd-edit-btn";
      cancelBtn.textContent = "취소";
      cancelBtn.addEventListener("click", () => {
        ta.remove(); saveBtn.remove(); cancelBtn.remove();
        if (banner) banner.style.display = "";
        btn.style.display = "";
      });
      wrap.insertBefore(ta, btn);
      wrap.insertBefore(saveBtn, btn);
      wrap.insertBefore(cancelBtn, btn);
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    };

    if (retroRecord.retro) {
      const text = document.createElement("div");
      text.className = "hd-retro-banner";
      text.textContent = retroRecord.retro;
      text.style.cursor = "pointer";
      text.title = "클릭해서 수정";
      text.addEventListener("click", openEdit);
      wrap.appendChild(text);
    }
    btn.addEventListener("click", openEdit);
    wrap.appendChild(btn);
  }

  // ── 그룹별 블록 렌더링 ──
  const toHHMM = ms => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };
  const parseTimeText = str => {
    str = str.trim().replace(/\s/g, "");
    let m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return { h: parseInt(m[1]), min: parseInt(m[2]) };
    m = str.match(/^(\d{1,2})시(\d{2})?분?$/);
    if (m) return { h: parseInt(m[1]), min: m[2] ? parseInt(m[2]) : 0 };
    return null;
  };

  groups.forEach((group, gi) => {
    const groupEl = document.createElement("div");
    groupEl.className = "hd-session-group";
    if (gi > 0) groupEl.style.cssText = "margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);";

    const earliest = Math.min(...group.map(r => r.startMs));
    const latest = Math.max(...group.map(r => r.endMs));
    const spanMs = latest - earliest;

    // 세션 합치기 버튼 (그룹 내 2개 이상일 때만)
    if (group.length > 1) {
      const mergeBtn = document.createElement("button");
      mergeBtn.className = "hd-edit-btn";
      mergeBtn.style.cssText = "margin-bottom:8px;font-size:11px;opacity:0.6;";
      mergeBtn.textContent = `세션 합치기 (${group.length}개 → 1개)`;
      mergeBtn.addEventListener("click", async () => {
        const mergedCheckIns = group.flatMap(r => r.checkIns || []);
        const retro = [...group].reverse().find(r => r.retro)?.retro || "";
        const base = group.find(r => r.startMs === earliest);
        await updateRecord(base._id, {
          startMs: earliest, endMs: latest,
          durationMs: latest - earliest,
          checkIns: mergedCheckIns, retro
        });
        for (const r of group) {
          if (r._id !== base._id) await deleteRecord(r._id);
        }
        await renderHistoryScreen();
      });
      groupEl.appendChild(mergeBtn);
    }

    // 시간 범위 + 세션수 + 시간수정
    const summaryEl = document.createElement("div");
    summaryEl.className = "hd-summary";
    const timeSpan = document.createElement("span");
    timeSpan.textContent = `${formatClock(new Date(earliest))} – ${formatClock(new Date(latest))}`;
    const countSpan = document.createElement("span");
    countSpan.textContent = `${group.length}세션`;
    const editTimeBtn = document.createElement("button");
    editTimeBtn.className = "hd-edit-btn";
    editTimeBtn.textContent = "시간 수정";
    editTimeBtn.addEventListener("click", () => {
      if (summaryEl.querySelector(".hd-time-edit-row")) return;
      const row = document.createElement("div");
      row.className = "hd-time-edit-row";
      row.innerHTML = `
        <input class="hd-time-input" id="hd-st-${gi}" type="text" value="${toHHMM(earliest)}" style="width:60px;text-align:center;">
        <span style="color:rgba(255,255,255,0.4);font-size:12px">–</span>
        <input class="hd-time-input" id="hd-et-${gi}" type="text" value="${toHHMM(latest)}" style="width:60px;text-align:center;">
        <button class="hd-save-btn" id="hd-ts-${gi}">저장</button>
        <button class="hd-edit-btn" id="hd-tc-${gi}">취소</button>
      `;
      summaryEl.appendChild(row);
      row.querySelector(`#hd-tc-${gi}`).addEventListener("click", () => row.remove());
      row.querySelector(`#hd-ts-${gi}`).addEventListener("click", async () => {
        const stP = parseTimeText(row.querySelector(`#hd-st-${gi}`).value);
        const etP = parseTimeText(row.querySelector(`#hd-et-${gi}`).value);
        if (!stP || !etP) return;
        const base = new Date(earliest);
        const newStart = new Date(base); newStart.setHours(stP.h, stP.min, 0, 0);
        const newEnd = new Date(base); newEnd.setHours(etP.h, etP.min, 0, 0);
        if (newEnd <= newStart) return;
        const firstR = group.find(r => r.startMs === earliest);
        const lastR = group.reduce((a, b) => b.endMs > a.endMs ? b : a);
        if (firstR?._id) {
          firstR.startMs = newStart.getTime();
          firstR.durationMs = firstR.endMs - firstR.startMs;
          await updateRecord(firstR._id, { startMs: firstR.startMs, durationMs: firstR.durationMs });
        }
        if (lastR?._id && lastR._id !== firstR?._id) {
          lastR.endMs = newEnd.getTime();
          lastR.durationMs = lastR.endMs - lastR.startMs;
          await updateRecord(lastR._id, { endMs: lastR.endMs, durationMs: lastR.durationMs });
        } else if (firstR?._id) {
          firstR.endMs = newEnd.getTime();
          firstR.durationMs = newEnd - newStart;
          await updateRecord(firstR._id, { endMs: firstR.endMs, durationMs: firstR.durationMs });
        }
        await renderHistoryScreen();
      });
    });
    const delSessionBtn = document.createElement("button");
    delSessionBtn.className = "hd-edit-btn";
    delSessionBtn.style.cssText = "color:rgba(255,100,100,0.6);border-color:rgba(255,100,100,0.25);";
    delSessionBtn.textContent = "삭제";
    delSessionBtn.addEventListener("click", async () => {
      if (!confirm("이 세션을 삭제할까요?")) return;
      for (const r of group) await deleteRecord(r._id);
      await renderHistoryScreen();
    });
    summaryEl.appendChild(timeSpan);
    summaryEl.appendChild(countSpan);
    summaryEl.appendChild(editTimeBtn);
    summaryEl.appendChild(delSessionBtn);
    groupEl.appendChild(summaryEl);

    // 진행 바
    if (spanMs > 0) {
      const barEl = document.createElement("div");
      barEl.className = "hd-bar";
      group.forEach(r => {
        const seg = document.createElement("div");
        seg.className = "hd-bar-seg";
        seg.style.left = ((r.startMs - earliest) / spanMs * 100).toFixed(1) + "%";
        seg.style.width = Math.max((r.durationMs / spanMs * 100), 1).toFixed(1) + "%";
        barEl.appendChild(seg);
      });
      groupEl.appendChild(barEl);
    }

    // 이 그룹의 체크인 목록
    const groupCheckins = group.flatMap(r =>
      (r.checkIns || [])
        .map((c, idx) => ({ ...c, _idx: idx, _record: r }))
        .filter(c => c.text && c.text !== "(기록 없음)")
    );
    if (groupCheckins.length > 0) {
      const ul = document.createElement("ul");
      ul.className = "hd-checkins";
      groupCheckins.forEach(c => {
        const li = document.createElement("li");
        li.className = "hd-checkin";
        const labelEl = document.createElement("span");
        labelEl.className = "hd-checkin-label";
        labelEl.textContent = c.label;
        const textEl = document.createElement("span");
        textEl.className = "hd-checkin-text";
        textEl.textContent = c.text;
        li.appendChild(labelEl);
        li.appendChild(textEl);
        if (c._record?._id) {
          const editBtn = document.createElement("button");
          editBtn.className = "hd-edit-btn";
          editBtn.style.marginLeft = "6px";
          editBtn.textContent = "수정";
          editBtn.addEventListener("click", () => {
            if (li.querySelector(".hd-checkin-inline-input")) return;
            const input = document.createElement("input");
            input.type = "text";
            input.className = "hd-checkin-inline-input";
            input.value = c.text;
            const saveBtn = document.createElement("button");
            saveBtn.className = "hd-save-btn";
            saveBtn.textContent = "저장";
            saveBtn.addEventListener("click", async () => {
              c._record.checkIns[c._idx].text = input.value.trim();
              await updateRecord(c._record._id, { checkIns: c._record.checkIns });
              records.find(r => r._id === c._record._id).checkIns = c._record.checkIns;
              renderDetailContent(container, records);
            });
            const cancelBtn = document.createElement("button");
            cancelBtn.className = "hd-edit-btn";
            cancelBtn.textContent = "취소";
            cancelBtn.addEventListener("click", () => { input.remove(); saveBtn.remove(); cancelBtn.remove(); textEl.style.display = ""; });
            textEl.style.display = "none";
            li.appendChild(input);
            li.appendChild(saveBtn);
            li.appendChild(cancelBtn);
            input.focus();
          });
          const delBtn = document.createElement("button");
          delBtn.className = "hd-edit-btn";
          delBtn.style.cssText = "margin-left:4px;color:rgba(255,100,100,0.6);border-color:rgba(255,100,100,0.25);";
          delBtn.textContent = "삭제";
          delBtn.addEventListener("click", async () => {
            c._record.checkIns.splice(c._idx, 1);
            await updateRecord(c._record._id, { checkIns: c._record.checkIns });
            records.find(r => r._id === c._record._id).checkIns = c._record.checkIns;
            renderDetailContent(container, records);
          });
          li.appendChild(editBtn);
          li.appendChild(delBtn);
        }
        ul.appendChild(li);
      });
      groupEl.appendChild(ul);
    }

    // 이 그룹의 회고 (그룹 내 마지막 레코드 사용)
    const groupRetroRecord = [...group].reverse().find(r => r.retro) || group[group.length - 1];
    if (groupRetroRecord?._id) {
      const rWrap = document.createElement("div");
      rWrap.className = "hd-retro-wrap";
      rWrap.style.marginTop = "8px";
      buildRetroWrap(groupRetroRecord, rWrap);
      groupEl.appendChild(rWrap);
    }

    container.appendChild(groupEl);
  });

  // ── 기록 추가 버튼 (맨 아래) ──
  const targetRecord = records[records.length - 1];
  const addWrap = document.createElement("div");
  addWrap.style.cssText = "margin:6px 0 2px;";
  const addBtn = document.createElement("button");
  addBtn.className = "hd-edit-btn";
  addBtn.textContent = "+ 기록 추가";
  addBtn.addEventListener("click", () => {
    if (addWrap.querySelector(".hd-add-form")) return;
    addBtn.style.display = "none";
    const form = document.createElement("div");
    form.className = "hd-add-form";
    const ta = document.createElement("textarea");
    ta.className = "checkin-textarea";
    ta.placeholder = "어떤 작업을 했나요?";
    ta.style.cssText = "width:100%;margin-top:6px;";
    const actions = document.createElement("div");
    actions.className = "checkin-input-actions";
    actions.style.marginTop = "6px";
    const saveBtn = document.createElement("button");
    saveBtn.className = "checkin-save-btn";
    saveBtn.textContent = "저장";
    saveBtn.addEventListener("click", async () => {
      const text = ta.value.trim();
      if (!text) return;
      const rec = targetRecord;
      if (!rec._id) return;
      const newEntry = { label: formatClock(new Date()), text, timeMs: Date.now() };
      rec.checkIns = rec.checkIns || [];
      rec.checkIns.push(newEntry);
      await updateRecord(rec._id, { checkIns: rec.checkIns });
      renderDetailContent(container, records, dateStr);
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "checkin-cancel-btn";
    cancelBtn.textContent = "취소";
    cancelBtn.addEventListener("click", () => { form.remove(); addBtn.style.display = ""; });
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(ta);
    form.appendChild(actions);
    addWrap.appendChild(form);
    ta.focus();
  });
  addWrap.appendChild(addBtn);
  container.appendChild(addWrap);
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
    const last = checkIns[checkIns.length - 1];
    if (!last.endMs) liveTaskEl.textContent = fmtDur(nowMs - last.timeMs);
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
  updateFocusScreen();
}

function resumeSession() {
  if (!startedAtMs || !isPaused) return;
  totalPausedMs += Date.now() - pausedAt;
  isPaused = false;
  pausedAt = null;
  els.sessionBadge.textContent = "작업 기록 중";
  if (els.pauseButton) { els.pauseButton.textContent = "일시정지"; }
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
  showScreen("focus");
  els.sessionBadge.textContent = "작업 기록 중";
  if (els.pauseButton) els.pauseButton.textContent = "일시정지";
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
    els.todayText.textContent = formatDate();

    if (startedAtMs) {
      showScreen("focus");
      els.sessionBadge.textContent = "작업 기록 중";
      updateFocusScreen();
      timerId = setInterval(updateFocusScreen, 1000);
    } else {
      showScreen("welcome");
      els.sessionBadge.textContent = "대기";
    }

    updateWelcomeScreen();
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
  document.getElementById("endButtonFixed")?.addEventListener("click", () => {
    renderHistoryScreen();
    showScreen("history");
  });
  els.endButton?.addEventListener("click", endSession);
  document.getElementById("homeBtn")?.addEventListener("click", () => showScreen("welcome"));
  els.viewRecordButton?.addEventListener("click", () => {
    if (startedAtMs) lastSessionMs = Date.now() - startedAtMs;
    openSummaryScreen();
  });
  els.summaryBackButton?.addEventListener("click", () => {
    if (startedAtMs) showScreen("focus");
    else showScreen("welcome");
  });
  els.summarySaveButton?.addEventListener("click", async () => {
    await saveSessionToHistory();
    showScreen("welcome");
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
    renderHistoryScreen();
    showScreen("history");
  });

  els.historyBackButton?.addEventListener("click", () => {
    if (startedAtMs) showScreen("focus");
    else showScreen("welcome");
  });

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

  const welcomeScreen = document.getElementById("welcomeScreen");
  const openFeedback = () => {
    feedbackModal?.classList.remove("hidden");
    welcomeScreen?.classList.add("modal-blur");
    feedbackTextarea?.focus();
  };
  const closeFeedback = () => {
    feedbackModal?.classList.add("hidden");
    welcomeScreen?.classList.remove("modal-blur");
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

  // 기록 버튼
  els.addNoteBtn?.addEventListener("click", openCheckinInput);
  els.checkinCancelBtn?.addEventListener("click", closeCheckinInput);
  els.checkinSaveBtn?.addEventListener("click", saveCheckin);
  els.checkinTextarea?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveCheckin(); }
    if (e.key === "Escape") closeCheckinInput();
  });
}

init();
