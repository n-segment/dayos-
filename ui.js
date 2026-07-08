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
  if (h >= 17 && h < 20) return { eyebrow: "", title: "ദ്ദി (ˊᗜˋა)", desc: "오늘도 화이팅" };
  return { eyebrow: "", title: "ദ്ദി (ˊᗜˋა)", desc: "오늘도 화이팅" };
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

function saveCheckin() {
  const text = els.checkinTextarea.value.trim();
  if (!text) return;
  checkIns.push({
    timeMs: Date.now(),
    label: formatClock(new Date()),
    text,
  });
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
    const li = document.createElement("li");
    li.className = "checkin-log__item" + (c.text === null ? " checkin-log__item--skip" : "");
    li.innerHTML = `
      <span class="checkin-log__time">${formatClock(new Date(c.timeMs))}</span>
      <span class="checkin-log__label">${c.label}</span>
      <span class="checkin-log__text">${c.text !== null ? c.text : "—"}</span>
      <button class="checkin-log__edit" onclick="editCheckin(${idx})">수정</button>
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
  const endBtn = document.getElementById("endButtonFixed");
  if (endBtn) endBtn.classList.toggle("visible", screen === "focus");
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
  el.textContent = h > 0 && m > 0 ? `${h}시간 ${m}분` : h > 0 ? `${h}시간` : `${m}분`;
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
  updateGoalTotal();
  const timeEl = $("goalStartTime");
  if (timeEl && !timeEl.value) timeEl.value = formatClock();
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
      return snapshot.docs.map(doc => doc.data());
    } catch (e) {
      console.error("Firestore 로드 실패:", e);
    }
  }
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
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
  const history = await getHistory();

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
      ${hasData ? '<span class="history-day-arrow">›</span>' : ''}
    `;
    if (hasData) {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => toggleDayDetail(row, dayRecords, dateStr));
    }
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

  const totalEl = document.createElement("p");
  totalEl.className = "history-period-total";
  totalEl.textContent = monthTotalMs > 0 ? `총 ${mh > 0 ? mh + "시간 " : ""}${mm}분` : "기록 없음";
  els.historyList.appendChild(totalEl);

  const daysInMonth = monthEnd.getDate();
  for (let day = daysInMonth; day >= 1; day--) {
    const d = new Date(year, month, day);
    const dateStr = toDateStr(d.getTime());
    const dayRecords = byDate[dateStr] || [];
    if (!dayRecords.length && d > now) continue;

    const dayTotalMs = dayRecords.reduce((s, r) => s + (r.durationMs || 0), 0);
    const isToday = dateStr === toDateStr(Date.now());
    const hasData = dayRecords.length > 0;

    const row = document.createElement("div");
    row.className = "history-day-row" + (isToday ? " history-day-row--today" : "") + (!hasData ? " history-day-row--empty" : "");

    const dayH = Math.floor(dayTotalMs / 3600000);
    const dayM = Math.floor((dayTotalMs % 3600000) / 60000);
    const timeStr = hasData ? (dayH > 0 ? `${dayH}시간 ${dayM}분` : `${dayM}분`) : "—";

    row.innerHTML = `
      <span class="history-day-name">${WEEKDAYS[d.getDay()]}</span>
      <span class="history-day-date">${month+1}/${day}</span>
      <span class="history-day-time">${timeStr}</span>
      ${hasData ? '<span class="history-day-arrow">›</span>' : ''}
    `;
    if (hasData) {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => toggleDayDetail(row, dayRecords, dateStr));
    }
    els.historyList.appendChild(row);
  }

  const olderRecords = history.filter(r => new Date(r.startMs) < monthStart);
  if (olderRecords.length > 0) {
    const byMonth = {};
    olderRecords.forEach(r => {
      const d = new Date(r.startMs);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!byMonth[key]) byMonth[key] = { records: [], label: `${d.getFullYear()}년 ${d.getMonth()+1}월` };
      byMonth[key].records.push(r);
    });

    Object.entries(byMonth).sort((a,b) => b[0].localeCompare(a[0])).forEach(([key, { records, label }]) => {
      const sep = document.createElement("p");
      sep.className = "history-section-label";
      sep.textContent = label;
      els.historyList.appendChild(sep);

      const mByDate = {};
      records.forEach(r => {
        if (!mByDate[r.date]) mByDate[r.date] = [];
        mByDate[r.date].push(r);
      });

      Object.entries(mByDate).sort((a,b) => b[0].localeCompare(a[0])).forEach(([date, recs]) => {
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
    });
  }
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

  records.forEach(r => {
    if (r.durationMs < 60000) return;

    const startTime = formatClock(new Date(r.startMs));
    const endTime = formatClock(new Date(r.endMs));
    const h = Math.floor(r.durationMs/3600000), m = Math.floor((r.durationMs%3600000)/60000);

    let html = `<div class="hd-session">`;

    if (r.retro) {
      html += `<div class="hd-retro">${r.retro}</div>`;
    }

    if (r.checkIns && r.checkIns.length > 0) {
      const validCheckins = r.checkIns.filter(c => c.text && c.text !== "(기록 없음)");
      if (validCheckins.length > 0) {
        html += `<ul class="hd-checkins">`;
        validCheckins.forEach(c => {
          html += `<li class="hd-checkin"><span class="hd-checkin-label">${c.label}</span><span class="hd-checkin-text">${c.text}</span></li>`;
        });
        html += `</ul>`;
      }
    }

    html += `<div class="hd-session-meta">${startTime} → ${endTime} · ${h>0?h+"시간 "+m+"분":m+"분"}</div>`;
    html += `</div>`;
    detail.innerHTML += html;
  });

  row.after(detail);
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
  $("goalModalClose")?.addEventListener("click", closeGoalModal);
  $("goalSaveBtn")?.addEventListener("click", closeGoalModal);
  els.pauseButton?.addEventListener("click", () => {
    if (isPaused) resumeSession(); else pauseSession();
  });
  document.getElementById("endButtonFixed")?.addEventListener("click", endSession);
  els.endButton?.addEventListener("click", endSession);
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
    showScreen("welcome");
  });

  // 음악 버튼
  const musicBtn = document.getElementById("musicBtn");
  const musicFrame = document.getElementById("musicFrame");
  let musicPlaying = false;
  const MUSIC_SRC = "https://www.youtube.com/embed/46e80ussWc0?autoplay=1&loop=1&playlist=46e80ussWc0&enablejsapi=1";

  musicBtn?.addEventListener("click", () => {
    if (!musicPlaying) {
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

  // 기록 버튼
  els.addNoteBtn?.addEventListener("click", openGoalModal);
  els.checkinCancelBtn?.addEventListener("click", closeCheckinInput);
  els.checkinSaveBtn?.addEventListener("click", saveCheckin);
  els.checkinTextarea?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveCheckin(); }
    if (e.key === "Escape") closeCheckinInput();
  });
}

init();
