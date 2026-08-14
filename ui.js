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
const ONBOARDING_KEY = "dayos_onboarding_seen_v1";

const els = {
  loginScreen: $("loginScreen"),
  loginErrorMessage: $("loginErrorMessage"),
  googleLoginBtn: $("googleLoginBtn"),
  localLoginBtn: $("localLoginBtn"),
  homeEditToggle: $("homeEditToggle"),
  homeBgBtn: $("homeBgBtn"),
  homeBgInput: $("homeBgInput"),
  onboardingOverlay: $("onboardingOverlay"),
  onboardingCloseBtn: $("onboardingCloseBtn"),
  profileBtn: $("profileBtn"),
  profileMenu: $("profileMenu"),
  profileName: $("profileName"),
  profileEmail: $("profileEmail"),
  logoutBtn: $("logoutBtn"),
  welcomeScreen: $("welcomeScreen"),
  goalModal: $("goalModal"),
  focusScreen: $("focusScreen"),
  summaryScreen: $("summaryScreen"),
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
  appFloatingNav: $("appFloatingNav"),
  appFloatingNavHitarea: $("appFloatingNavHitarea"),
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
let localDevMode = false;
let homeEditMode = false;

const segmentMemos = {};

// ── 홈 배경 미디어 ──
const HOME_BG_DB = "dayos_home_bg_v1";
const HOME_BG_STORE = "background";
const HOME_BG_KEY = "current";
let homeBgObjectUrl = null;
let homeBgInitialized = false;

function openHomeBgDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HOME_BG_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HOME_BG_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getHomeBgRecord() {
  const dbi = await openHomeBgDb();
  return new Promise((resolve, reject) => {
    const tx = dbi.transaction(HOME_BG_STORE, "readonly");
    const req = tx.objectStore(HOME_BG_STORE).get(HOME_BG_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveHomeBgRecord(file) {
  const dbi = await openHomeBgDb();
  const record = {
    blob: file,
    type: file.type,
    name: file.name,
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = dbi.transaction(HOME_BG_STORE, "readwrite");
    tx.objectStore(HOME_BG_STORE).put(record, HOME_BG_KEY);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

function getDefaultHomeBgSrc() {
  const hour = new Date().getHours();
  return hour >= 0 && hour < 6 ? "./dawn-drive.mp4" : "./bg.MOV";
}

function applyHomeBackground(record) {
  const section = document.getElementById("homeSection");
  if (!section) return;
  const video = section.querySelector(".welcome-bg-video");
  section.querySelectorAll(".home-custom-bg").forEach(el => el.remove());
  if (homeBgObjectUrl) URL.revokeObjectURL(homeBgObjectUrl);
  homeBgObjectUrl = null;

  if (!record?.blob) {
    if (video) {
      video.src = getDefaultHomeBgSrc();
      video.style.display = "";
      video.load();
      video.play().catch(() => {});
    }
    return;
  }

  homeBgObjectUrl = URL.createObjectURL(record.blob);
  if (record.type?.startsWith("image/")) {
    if (video) video.style.display = "none";
    const img = document.createElement("img");
    img.className = "home-custom-bg";
    img.src = homeBgObjectUrl;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    section.insertBefore(img, section.firstChild);
    return;
  }

  if (record.type?.startsWith("video/") && video) {
    video.style.display = "";
    video.src = homeBgObjectUrl;
    video.load();
    video.play().catch(() => {});
  }
}

async function initHomeBackgroundSystem() {
  if (!homeBgInitialized) {
    homeBgInitialized = true;
    els.homeBgBtn?.addEventListener("click", () => els.homeBgInput?.click());
    els.homeBgInput?.addEventListener("change", async () => {
      const file = els.homeBgInput.files?.[0];
      els.homeBgInput.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        alert("이미지나 영상 파일만 배경으로 사용할 수 있어요.");
        return;
      }
      try {
        const record = await saveHomeBgRecord(file);
        applyHomeBackground(record);
      } catch (err) {
        console.error("배경 저장 실패:", err);
        alert("배경 파일을 저장하지 못했어요. 파일 용량을 줄여서 다시 시도해주세요.");
      }
    });
  }

  try {
    applyHomeBackground(await getHomeBgRecord());
  } catch (err) {
    console.error("배경 불러오기 실패:", err);
  }
}

// ── 스티키 메모 시스템 ──
const MEMO_KEY = "dayos_memos_v1";
let memos = [];

function loadMemos() {
  try { memos = JSON.parse(localStorage.getItem(MEMO_KEY) || "[]"); } catch { memos = []; }
}
function saveMemos() { localStorage.setItem(MEMO_KEY, JSON.stringify(memos)); }

function renderMemos() {
  const section = document.getElementById("homeSection");
  if (!section) return;
  section.querySelectorAll(".sticky-memo").forEach(el => el.remove());
  memos.forEach((memo, idx) => {
    const el = document.createElement("div");
    el.className = "sticky-memo";
    el.style.left = (memo.x || 40 + idx * 20) + "px";
    el.style.top = (memo.y || 80 + idx * 20) + "px";
    el.innerHTML = `<button class="sticky-memo-delete" data-idx="${idx}">×</button>${memo.text}`;
    // 드래그
    let dragging = false, ox = 0, oy = 0;
    el.addEventListener("mousedown", e => {
      if (e.target.classList.contains("sticky-memo-delete")) return;
      dragging = true;
      ox = e.clientX - el.offsetLeft;
      oy = e.clientY - el.offsetTop;
      el.style.transition = "none";
      e.preventDefault();
    });
    document.addEventListener("mousemove", e => {
      if (!dragging) return;
      el.style.left = (e.clientX - ox) + "px";
      el.style.top = (e.clientY - oy) + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      memos[idx].x = parseInt(el.style.left);
      memos[idx].y = parseInt(el.style.top);
      saveMemos();
    });
    el.querySelector(".sticky-memo-delete").addEventListener("click", () => {
      memos.splice(idx, 1);
      saveMemos();
      renderMemos();
    });
    section.appendChild(el);
  });
}

// ── 음악 시스템 v2 ───────────────────────────────────────────────────
const MUSIC_V2_KEY = "dayos_music_v2";
const DEFAULT_MUSIC_VIDEOS = [
  { id: "aB2z36lEJ_E", title: "새벽 lo-fi", time: "night" },
  { id: "46e80ussWc0", title: "집중 lo-fi", time: "day" },
];

function initMusicSystemV2() {
  let videos = (() => { try { return JSON.parse(localStorage.getItem(MUSIC_V2_KEY)) || [...DEFAULT_MUSIC_VIDEOS]; } catch { return [...DEFAULT_MUSIC_VIDEOS]; } })();
  let currentId = null;
  let panelOpen = false;
  let addTime = "day";
  let activeTab = "all";

  const musicBtn = document.getElementById("musicBtn");
  const panel = document.getElementById("musicPanel");
  const floatPlayer = document.getElementById("musicFloatPlayer");
  const mfpFrame = document.getElementById("mfpFrame");
  if (!musicBtn || !panel) return;

  function saveVideos() { localStorage.setItem(MUSIC_V2_KEY, JSON.stringify(videos)); }

  function ytSrc(id) {
    return `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&rel=0`;
  }

  function getYTId(url) {
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  async function fetchTitle(id) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
      if (r.ok) return (await r.json()).title;
    } catch {}
    return id;
  }

  function playVideo(id) {
    currentId = id;
    if (mfpFrame) mfpFrame.src = ytSrc(id);
    floatPlayer?.classList.remove("hidden");
    musicBtn.classList.add("is-playing");
    renderPanel();
  }

  function stopVideo() {
    currentId = null;
    if (mfpFrame) mfpFrame.src = "";
    floatPlayer?.classList.add("hidden");
    musicBtn.classList.remove("is-playing");
    renderPanel();
  }

  function renderPanel() {
    const filtered = activeTab === "all" ? videos : videos.filter(v => v.time === activeTab);
    panel.innerHTML = `
      <div class="mp-tabs">
        <button class="mp-tab${activeTab==="all"?" active":""}" data-tab="all">전체</button>
        <button class="mp-tab${activeTab==="day"?" active":""}" data-tab="day">☀︎ 낮</button>
        <button class="mp-tab${activeTab==="night"?" active":""}" data-tab="night">☽ 밤</button>
      </div>
      <div class="mp-list">
        ${filtered.length === 0 ? `<div class="mp-empty">없음</div>` : filtered.map(v => {
          const gi = videos.indexOf(v);
          const isPlaying = v.id === currentId;
          return `<div class="mp-item${isPlaying?" mp-item--active":""}">
            <img class="mp-thumb" src="https://i.ytimg.com/vi/${v.id}/default.jpg" />
            <div class="mp-item-meta">
              <div class="mp-item-title">${v.title || v.id}</div>
              <span class="mp-tag mp-tag--${v.time}">${v.time==="day"?"낮":"밤"}</span>
            </div>
            <div class="mp-item-btns">
              <button class="mp-btn-play" data-id="${v.id}">${isPlaying?"■":"▶"}</button>
              <button class="mp-btn-tag" data-i="${gi}">${v.time==="day"?"→밤":"→낮"}</button>
              <button class="mp-btn-del" data-i="${gi}">×</button>
            </div>
          </div>`;
        }).join("")}
      </div>
      <div class="mp-add">
        <input class="mp-url-input" id="mpUrlInput" placeholder="YouTube URL..." />
        <div class="mp-add-tags">
          <button class="mp-add-tag${addTime==="day"?" active":""}" data-time="day">☀︎ 낮</button>
          <button class="mp-add-tag${addTime==="night"?" active":""}" data-time="night">☽ 밤</button>
        </div>
        <button class="mp-add-btn" id="mpAddBtn">추가</button>
      </div>
    `;

    panel.querySelectorAll(".mp-tab").forEach(b => b.addEventListener("click", () => { activeTab = b.dataset.tab; renderPanel(); }));
    panel.querySelectorAll(".mp-btn-play").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.id === currentId) stopVideo(); else playVideo(b.dataset.id);
    }));
    panel.querySelectorAll(".mp-btn-tag").forEach(b => b.addEventListener("click", () => {
      const i = +b.dataset.i;
      videos[i].time = videos[i].time === "day" ? "night" : "day";
      saveVideos(); renderPanel();
    }));
    panel.querySelectorAll(".mp-btn-del").forEach(b => b.addEventListener("click", () => {
      const i = +b.dataset.i;
      if (videos[i].id === currentId) stopVideo();
      videos.splice(i, 1); saveVideos(); renderPanel();
    }));
    panel.querySelectorAll(".mp-add-tag").forEach(b => b.addEventListener("click", () => { addTime = b.dataset.time; renderPanel(); }));
    document.getElementById("mpAddBtn")?.addEventListener("click", async () => {
      const inp = document.getElementById("mpUrlInput");
      const id = getYTId(inp.value.trim());
      if (!id) { inp.style.outline = "1px solid rgba(255,100,100,0.6)"; setTimeout(() => inp.style.outline = "", 1000); return; }
      inp.disabled = true;
      const title = await fetchTitle(id);
      videos.push({ id, title, time: addTime });
      saveVideos(); inp.value = ""; inp.disabled = false;
      renderPanel();
    });
    document.getElementById("mpUrlInput")?.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("mpAddBtn")?.click(); });
  }

  // 패널 토글
  musicBtn.addEventListener("click", e => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    if (panelOpen) { renderPanel(); panel.classList.remove("hidden"); }
    else panel.classList.add("hidden");
  });
  document.addEventListener("click", e => {
    if (panelOpen && !panel.contains(e.target) && e.target !== musicBtn) {
      panelOpen = false; panel.classList.add("hidden");
    }
  });

  // 플로팅 플레이어 닫기
  document.getElementById("mfpClose")?.addEventListener("click", stopVideo);

  // 플로팅 플레이어 드래그
  const dragHandle = document.getElementById("mfpDragHandle");
  if (dragHandle && floatPlayer) {
    let dragging = false, ox = 0, oy = 0;
    dragHandle.addEventListener("mousedown", e => {
      dragging = true; ox = e.clientX - floatPlayer.offsetLeft; oy = e.clientY - floatPlayer.offsetTop; e.preventDefault();
    });
    document.addEventListener("mousemove", e => { if (dragging) { floatPlayer.style.left = (e.clientX - ox) + "px"; floatPlayer.style.top = (e.clientY - oy) + "px"; } });
    document.addEventListener("mouseup", () => { dragging = false; });
  }
}

// ── X 임베드 시스템 ──────────────────────────────────────────────────
const EMBED_KEY = "dayos_embeds_v1";
let embeds = [];

function loadEmbeds() { try { embeds = JSON.parse(localStorage.getItem(EMBED_KEY) || "[]"); } catch { embeds = []; } }
function saveEmbeds() { localStorage.setItem(EMBED_KEY, JSON.stringify(embeds)); }

function getTweetId(url) {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

function renderEmbeds() {
  document.querySelectorAll(".tweet-card").forEach(el => el.remove());
  const section = document.getElementById("homeSection");
  if (!section) return;

  embeds.forEach((embed, idx) => {
    const el = document.createElement("div");
    const videoOnly = embed.videoOnly || false;
    el.className = "tweet-card" + (videoOnly ? " tweet-card--video" : "");
    el.style.left = (embed.x || 80 + idx * 24) + "px";
    el.style.top = (embed.y || 120 + idx * 24) + "px";
    el.innerHTML = `
      <div class="tweet-card-drag-handle"></div>
      <button class="tweet-card-close" data-idx="${idx}">×</button>
      <button class="tweet-card-toggle" title="${videoOnly ? '전체 보기' : '영상만 보기'}">
        ${videoOnly ? '⊞' : '▶'}
      </button>
      <div class="tweet-card-viewport">
        <iframe
          src="https://platform.twitter.com/embed/Tweet.html?id=${embed.id}&theme=dark&dnt=true&lang=ko"
          width="280" height="420" frameborder="0" scrolling="no"
          allowtransparency="true"
        ></iframe>
      </div>
    `;

    // 드래그 (drag handle 영역만)
    const handle = el.querySelector(".tweet-card-drag-handle");
    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener("mousedown", e => {
      dragging = true;
      ox = e.clientX - el.offsetLeft;
      oy = e.clientY - el.offsetTop;
      e.preventDefault();
    });
    const onMove = e => {
      if (!dragging) return;
      el.style.left = (e.clientX - ox) + "px";
      el.style.top = (e.clientY - oy) + "px";
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      embeds[idx].x = parseInt(el.style.left);
      embeds[idx].y = parseInt(el.style.top);
      saveEmbeds();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    el.querySelector(".tweet-card-close").addEventListener("click", () => {
      embeds.splice(idx, 1);
      saveEmbeds();
      renderEmbeds();
    });

    el.querySelector(".tweet-card-toggle").addEventListener("click", () => {
      embeds[idx].videoOnly = !embeds[idx].videoOnly;
      saveEmbeds();
      renderEmbeds();
    });

    section.appendChild(el);
  });
}

function initEmbedSystem() {
  loadEmbeds();
  renderEmbeds();
  const btn = document.getElementById("embedBtn");
  const panel = document.getElementById("embedInputPanel");
  const input = document.getElementById("embedUrlInput");
  if (!btn || !panel || !input) return;

  btn.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });
  document.getElementById("embedCancelBtn")?.addEventListener("click", () => {
    panel.classList.remove("open");
    input.value = "";
  });
  document.getElementById("embedSaveBtn")?.addEventListener("click", () => {
    const id = getTweetId(input.value.trim());
    if (!id) { input.style.borderColor = "rgba(255,100,100,0.6)"; setTimeout(() => input.style.borderColor = "", 1000); return; }
    embeds.push({ id, x: 80 + (embeds.length % 4) * 28, y: 120 + (embeds.length % 3) * 28 });
    saveEmbeds();
    renderEmbeds();
    panel.classList.remove("open");
    input.value = "";
  });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("embedSaveBtn")?.click();
    if (e.key === "Escape") document.getElementById("embedCancelBtn")?.click();
  });
}

// ── 낙서 시스템 ──────────────────────────────────────────────────────
const DOODLE_KEY = "dayos_doodle_v1";

function initDoodleSystem() {
  const btn = document.getElementById("doodleBtn");
  const canvas = document.getElementById("doodleCanvas");
  const toolbar = document.getElementById("doodleToolbar");
  if (!btn || !canvas || !toolbar) return;

  const ctx = canvas.getContext("2d");
  let isDrawing = false;
  let isEraser = false;
  let penColor = "#ffffff";
  let penSize = 3;
  let lastX = 0, lastY = 0;
  const toolbarEraserBtn = document.getElementById("doodleEraserBtn");

  function setEraserMode(active) {
    isEraser = !!active;
    canvas.classList.toggle("is-eraser", isEraser);
    toolbarEraserBtn?.classList.toggle("active", isEraser);
    if (isEraser) {
      toolbar.querySelectorAll(".doodle-tool-color").forEach(x => x.classList.remove("active"));
    }
  }

  function resizeCanvas() {
    const img = canvas.toDataURL();
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // 기존 그림 복원
    if (img !== "data:,") {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0);
      image.src = img;
    }
  }

  function loadDoodle() {
    const saved = localStorage.getItem(DOODLE_KEY);
    if (!saved) return;
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0);
    image.src = saved;
  }

  function saveDoodle() {
    try { localStorage.setItem(DOODLE_KEY, canvas.toDataURL()); } catch(e) {}
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    const { x, y } = getPos(e);
    lastX = x; lastY = y;
    ctx.beginPath();
    ctx.arc(x, y, (isEraser ? penSize * 4 : penSize) / 2, 0, Math.PI * 2);
    ctx.fillStyle = isEraser ? "rgba(0,0,0,1)" : penColor;
    if (isEraser) ctx.globalCompositeOperation = "destination-out";
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = isEraser ? penSize * 4 : penSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (isEraser) ctx.globalCompositeOperation = "destination-out";
    else ctx.globalCompositeOperation = "source-over";
    ctx.stroke();
    lastX = x; lastY = y;
  }

  function endDraw() {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.globalCompositeOperation = "source-over";
    saveDoodle();
  }

  // 낙서 모드 ON/OFF
  let doodleActive = false;

  // 저장된 낙서 복원 (항상 화면에 표시)
  resizeCanvas();
  loadDoodle();
  canvas.classList.remove("hidden");
  canvas.style.pointerEvents = "none";

  function toggleDoodle() {
    if (currentAppView !== "home") return;
    doodleActive = !doodleActive;
    if (doodleActive) {
      canvas.style.pointerEvents = "auto";
      toolbar.classList.remove("hidden");
      btn.classList.add("active");
      document.body.classList.add("doodle-active");
      document.body.style.userSelect = "none";
    } else {
      canvas.style.pointerEvents = "none";
      toolbar.classList.add("hidden");
      btn.classList.remove("active");
      document.body.classList.remove("doodle-active");
      document.body.style.userSelect = "";
    }
  }

  btn.addEventListener("click", toggleDoodle);
  window.addEventListener("resize", () => { if (doodleActive) resizeCanvas(); });

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", endDraw);
  canvas.addEventListener("mouseleave", endDraw);
  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", draw, { passive: false });
  canvas.addEventListener("touchend", endDraw);

  // 색상 버튼
  toolbar.querySelectorAll(".doodle-tool-color").forEach(b => {
    b.addEventListener("click", () => {
      penColor = b.dataset.color;
      setEraserMode(false);
      toolbar.querySelectorAll(".doodle-tool-color").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
    });
  });

  // 크기 버튼
  toolbar.querySelectorAll(".doodle-tool-size").forEach(b => {
    b.addEventListener("click", () => {
      penSize = +b.dataset.size;
      toolbar.querySelectorAll(".doodle-tool-size").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
    });
  });

  // 지우개
  toolbarEraserBtn?.addEventListener("click", function() {
    setEraserMode(!isEraser);
  });

  // 전체 지우기
  document.getElementById("doodleClearBtn")?.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    localStorage.removeItem(DOODLE_KEY);
  });

  // 완료
  document.getElementById("doodleDoneBtn")?.addEventListener("click", toggleDoodle);
}

function initMemoSystem() {
  loadMemos();
  renderMemos();
  const btn = document.getElementById("memoBtn");
  const panel = document.getElementById("memoInputPanel");
  const textarea = document.getElementById("memoTextarea");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) textarea?.focus();
  });
  document.getElementById("memoCancelBtn")?.addEventListener("click", () => {
    panel.classList.remove("open");
    if (textarea) textarea.value = "";
  });
  document.getElementById("memoSaveBtn")?.addEventListener("click", () => {
    const text = textarea?.value.trim();
    if (!text) return;
    memos.push({ text, x: 40 + (memos.length % 5) * 30, y: 80 + (memos.length % 4) * 40 });
    saveMemos();
    renderMemos();
    panel.classList.remove("open");
    if (textarea) textarea.value = "";
  });
  textarea?.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) document.getElementById("memoSaveBtn")?.click();
  });
}

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
  return { eyebrow: "", title: "", desc: "" };
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

function _showEl(el) { if (el) { el.classList.remove("hidden"); el.style.display = ""; } }
function _hideEl(el) { if (el) { el.classList.add("hidden"); el.style.display = "none"; } }

let currentAppView = "home";
let _floatingNavTimer = null;

function setFloatingNavPeek(visible, autoHideMs = 0) {
  document.body.classList.toggle("app-floating-nav-peek", !!visible);
  if (_floatingNavTimer) {
    clearTimeout(_floatingNavTimer);
    _floatingNavTimer = null;
  }
  if (visible && autoHideMs > 0) {
    _floatingNavTimer = setTimeout(() => {
      if (currentAppView === "timetable") {
        document.body.classList.remove("app-floating-nav-peek");
      }
    }, autoHideMs);
  }
}

function handleFloatingNavPointer(event) {
  if (currentAppView !== "timetable") {
    setFloatingNavPeek(true);
    return;
  }
  const nearBottom = event.clientY > window.innerHeight - 80;
  const nearCenter = Math.abs(event.clientX - window.innerWidth / 2) < 200;
  setFloatingNavPeek(nearBottom && nearCenter);
}

function setAppView(view) {
  currentAppView = view === "timetable" ? "timetable" : "home";
  document.body.classList.toggle("app-view-home", currentAppView === "home");
  document.body.classList.toggle("app-view-timetable", currentAppView === "timetable");
  document.querySelectorAll(".app-floating-nav__btn").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.view === currentAppView);
  });

  if (currentAppView === "timetable") {
    setHomeEditMode(false);
    setFloatingNavPeek(true, 1400);
    renderHistoryScreen(_histDate || toDateStr(Date.now()));
    return;
  }

  setFloatingNavPeek(true);
  _hideEl(document.getElementById("historyScreen"));
  document.getElementById("homeSection")
    ?.scrollIntoView({ behavior: "smooth" });
}

function showScreen(screen) {
  const loginOverlay = document.getElementById("loginScreen");
  const appMain = document.getElementById("appMain");
  const summaryOverlay = document.getElementById("summaryScreen");
  const wsIdleState = document.getElementById("wsIdleState");
  const wsActiveState = document.getElementById("wsActiveState");

  if (screen === "login") {
    loginOverlay?.classList.add("is-active");
    _hideEl(appMain);
    return;
  }

  // Logged in — show app
  loginOverlay?.classList.remove("is-active");
  _showEl(appMain);

  if (screen === "focus") {
    _hideEl(wsIdleState);
    _showEl(wsActiveState);
    _hideEl(summaryOverlay);
    document.getElementById("workspaceSection")
      ?.scrollIntoView({ behavior: "smooth" });
  } else if (screen === "welcome") {
    if (!startedAtMs) {
      _showEl(wsIdleState);
      _hideEl(wsActiveState);
    }
    _hideEl(summaryOverlay);
    setAppView("home");
  } else if (screen === "history") {
    _hideEl(summaryOverlay);
    setAppView("timetable");
  } else if (screen === "summary") {
    _showEl(summaryOverlay);
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
  const startH = parseTime24($("goalStartTime")?.value || "");
  let endStr = "";
  if (startH !== null) {
    const endH = startH + total;
    endStr = `${formatTime24(Math.min(endH, 24))} (${durationStr})`;
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

function showLoginError(err) {
  const message = err?.code === "auth/unauthorized-domain"
    ? "Firebase 콘솔의 Authorized domains에 localhost 또는 127.0.0.1을 추가해야 로컬 로그인이 됩니다."
    : "로그인 실패: " + (err?.message || err?.code || "다시 시도해주세요.");

  if (els.loginErrorMessage) {
    els.loginErrorMessage.textContent = message;
    els.loginErrorMessage.classList.remove("hidden");
  } else {
    alert(message);
  }
}

function isLocalHost() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function signInWithGoogle() {
  els.loginErrorMessage?.classList.add("hidden");
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch((err) => {
    console.error("로그인 실패:", err);
    showLoginError(err);
  });
}

function signOut() {
  setHomeEditMode(false);
  els.profileMenu?.classList.add("hidden");
  els.profileBtn?.setAttribute("aria-expanded", "false");
  localDevMode = false;
  currentUser = null;
  _hideEl(document.getElementById("appMain"));
  showScreen("login");
  if (auth.currentUser) auth.signOut();
}

function canUseCloud() {
  return currentUser && !currentUser.isLocalDev;
}

function setHomeEditMode(active) {
  homeEditMode = !!active;
  document.body.classList.toggle("home-edit-mode", homeEditMode);
  els.homeEditToggle?.classList.toggle("is-active", homeEditMode);
  els.homeEditToggle?.setAttribute("aria-pressed", String(homeEditMode));
  if (!homeEditMode) {
    document.getElementById("memoInputPanel")?.classList.remove("open");
    document.getElementById("embedInputPanel")?.classList.remove("open");
  }
}

function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function shouldForceOnboardingPreview() {
  return isLocalHost() && new URLSearchParams(window.location.search).has("onboarding");
}

function showOnboardingIfNeeded() {
  if (!els.onboardingOverlay) return;
  if (hasSeenOnboarding() && !shouldForceOnboardingPreview()) return;
  els.onboardingOverlay.classList.remove("hidden");
}

function closeOnboarding() {
  try {
    localStorage.setItem(ONBOARDING_KEY, "1");
  } catch (error) {
    // localStorage가 막혀도 이번 화면에서는 닫히게 둔다.
  }
  els.onboardingOverlay?.classList.add("hidden");
}

function getProfileInitial(user) {
  const source = user?.displayName || user?.email || "D";
  return (source.trim().charAt(0) || "D").toUpperCase();
}

function updateProfileMenu(user) {
  if (!user) return;
  const name = user.isLocalDev ? "로컬 모드" : (user.displayName || "DayOS");
  const email = user.isLocalDev ? "브라우저에만 저장돼요" : (user.email || "Google 계정");
  if (els.profileBtn) els.profileBtn.textContent = getProfileInitial(user);
  if (els.profileName) els.profileName.textContent = name;
  if (els.profileEmail) els.profileEmail.textContent = email;
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
  if (canUseCloud()) {
    try {
      await db.collection("users").doc(currentUser.uid)
        .collection("history").add(record);
    } catch (e) {
      console.error("Firestore 저장 실패:", e);
    }
  }
}

async function getHistory() {
  if (canUseCloud()) {
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
  if (canUseCloud() && id) {
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
  if (canUseCloud() && id) {
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

// ─── 기록 화면 v2 — 활동 사이드바 + 주간 그리드 ──────────────────

let _histDate = null;
let _histWeekStart = null;
let _cachedHourH = 20; // shared between normal view and paint overlay
const TLOG_VIEW_KEY = "dayos_timetable_view_v1";
let _timetableView = (() => {
  try {
    const saved = localStorage.getItem(TLOG_VIEW_KEY);
    return ["plan", "actual", "both"].includes(saved) ? saved : "plan";
  } catch(e) {
    return "plan";
  }
})();

// Utility
function getWeekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  // Start on Monday (1). If Sunday (0) go back 6 days.
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
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

// ── Activity system (localStorage) ──
const ACT_KEY  = "dayos_activities_v1";
const TLOG_KEY = "dayos_timelog_v1";

const ACT_COLORS = [
  "#7A3A3A","#7A5A2A","#4A7A3A","#2A6A6A",
  "#2A4A7A","#5A2A7A","#7A2A5A","#4A4A4A"
];

const DEFAULT_ACTS = [
  { id:"act_sleep", name:"수면", emoji:"😴", icon:"./icon_sleep.svg", color:"#2A4A7A", goalH:7 },
  { id:"act_work",  name:"작업", emoji:"💻", icon:"./icon_work.svg",  color:"#5A2A7A", goalH:0 },
  { id:"act_food",  name:"밥",   emoji:"🍚", icon:"./icon_food.svg",  color:"#2A6A6A", goalH:0 },
];

const BLOCK_TYPES = [
  { value: "plan", label: "계획" },
  { value: "actual", label: "실행" },
];

function normalizeBlockType(type) {
  return type === "plan" ? "plan" : "actual";
}

function getBlockTypeLabel(type) {
  return normalizeBlockType(type) === "plan" ? "계획" : "실행";
}

function shouldShowBlockType(type) {
  const normalized = normalizeBlockType(type);
  return _timetableView === "both" || _timetableView === normalized;
}

function setTimetableView(type) {
  const nextView = ["plan", "actual", "both"].includes(type) ? type : "plan";
  _timetableView = nextView;
  try { localStorage.setItem(TLOG_VIEW_KEY, _timetableView); } catch(e) {}
}

function loadActs() {
  try {
    const r = localStorage.getItem(ACT_KEY);
    if (r) {
      const stored = JSON.parse(r);
      // migrate: sync icon + muted color from defaults
      const BRIGHT = ["#4A8DE6","#9B5AE6","#5AAE6A","#E64040","#E67040","#E6AA40","#E64078"];
      let changed = false;
      stored.forEach(a => {
        const def = DEFAULT_ACTS.find(d => d.id === a.id);
        if (def && def.icon && !a.icon) { a.icon = def.icon; changed = true; }
        if (def && BRIGHT.includes(a.color)) { a.color = def.color; changed = true; }
      });
      if (changed) localStorage.setItem(ACT_KEY, JSON.stringify(stored));
      return stored;
    }
  } catch(e) {}
  localStorage.setItem(ACT_KEY, JSON.stringify(DEFAULT_ACTS));
  return DEFAULT_ACTS.map(a => ({ ...a }));
}
function saveActs(acts) { localStorage.setItem(ACT_KEY, JSON.stringify(acts)); }

function loadTlog() {
  try { return JSON.parse(localStorage.getItem(TLOG_KEY) || "{}"); } catch(e) { return {}; }
}
function saveTlog(log) { localStorage.setItem(TLOG_KEY, JSON.stringify(log)); }

function pruneTlogForActs(tlog, acts) {
  const validActIds = new Set(acts.map(a => a.id));
  let changed = false;
  const next = {};
  Object.entries(tlog || {}).forEach(([dt, blocks]) => {
    if (!Array.isArray(blocks)) { changed = true; return; }
    const validBlocks = [];
    blocks.forEach(b => {
      const startH = roundTimeHour(b.startH);
      const endH = roundTimeHour(b.endH);
      const keep = validActIds.has(b.actId) && Number.isFinite(startH) && Number.isFinite(endH) && startH >= 0 && endH <= 24 && startH < endH;
      if (!keep) { changed = true; return; }
      if (startH !== b.startH || endH !== b.endH) changed = true;
      const type = normalizeBlockType(b.type);
      if (type !== b.type) changed = true;
      validBlocks.push({ ...b, startH, endH, type });
    });
    if (validBlocks.length) next[dt] = validBlocks;
  });
  if (changed) saveTlog(next);
  return changed ? next : tlog;
}

function makeTblockId() { return "tb_" + Date.now() + "_" + Math.random().toString(36).slice(2,6); }

function clampRepeatEvery(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, 1), 365);
}

function _addRepeatStep(date, unit, every) {
  const d = new Date(date.getTime());
  if (unit === "daily") d.setDate(d.getDate() + every);
  else if (unit === "weekly") d.setDate(d.getDate() + every * 7);
  else if (unit === "monthly") d.setMonth(d.getMonth() + every);
  else if (unit === "yearly") d.setFullYear(d.getFullYear() + every);
  return d;
}

function getRepeatConfig(repeat, customUnit, customEvery) {
  if (repeat === "daily") return { unit: "daily", every: 1 };
  if (repeat === "weekly") return { unit: "weekly", every: 1 };
  if (repeat === "biweekly") return { unit: "weekly", every: 2 };
  if (repeat === "monthly") return { unit: "monthly", every: 1 };
  if (repeat === "yearly") return { unit: "yearly", every: 1 };
  if (repeat === "custom") return { unit: customUnit || "daily", every: clampRepeatEvery(customEvery) };
  return null;
}

function buildRepeatDates(startDateStr, repeat, customUnit, customEvery) {
  const cfg = getRepeatConfig(repeat, customUnit, customEvery);
  if (!cfg) return [startDateStr];
  const dates = [];
  const start = new Date(startDateStr + "T00:00:00");
  const limit = new Date(start.getTime());
  limit.setDate(limit.getDate() + 365);
  let cursor = new Date(start.getTime());
  while (cursor <= limit && dates.length < 366) {
    dates.push(toDateStr(cursor.getTime()));
    cursor = _addRepeatStep(cursor, cfg.unit, cfg.every);
  }
  return dates;
}

function formatKoreanHour(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  const ap = whole < 12 ? "오전" : "오후";
  const h12 = whole === 0 ? 12 : whole > 12 ? whole - 12 : whole;
  return `${ap} ${h12}:${String(minutes).padStart(2, "0")}`;
}

function roundTimeHour(value) {
  return Math.round(Number(value) * 60) / 60;
}

function parseTimeInput(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "");
  const meridiem = compact.includes("오후") || compact.includes("pm") ? "pm" : compact.includes("오전") || compact.includes("am") ? "am" : "";
  const cleaned = compact
    .replace(/오전|오후|am|pm/g, "")
    .replace(/시/g, ":")
    .replace(/분/g, "");
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined || match[2] === "" ? 0 : Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 24) return null;
  if (hour === 24 && minute > 0) return null;
  return roundTimeHour(hour + minute / 60);
}

function formatTime24(hour) {
  if (!Number.isFinite(Number(hour))) return "";
  const totalMinutes = Math.round(Number(hour) * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseTime24(value) {
  if (!value) return null;
  const parts = String(value).split(":");
  const h = Number(parts[0]);
  const m = parts[1] !== undefined ? Number(parts[1]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return roundTimeHour(h + m / 60);
}

function formatTimeInput(hour) {
  if (!Number.isFinite(Number(hour))) return "";
  const totalMinutes = Math.round(Number(hour) * 60);
  if (totalMinutes === 1440) return "24:00";
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const ap = h < 12 ? "오전" : "오후";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ap} ${h12}:${String(m).padStart(2, "0")}`;
}

function parseDurationInput(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "");
  let totalMinutes = 0;
  const hourMatch = compact.match(/(\d+(?:\.\d+)?)시간/);
  const minuteMatch = compact.match(/(\d+)분/);
  if (hourMatch) totalMinutes += Number(hourMatch[1]) * 60;
  if (minuteMatch) totalMinutes += Number(minuteMatch[1]);
  if (!hourMatch && !minuteMatch) {
    const n = Number(compact.replace(/h/g, ""));
    if (!Number.isFinite(n)) return null;
    totalMinutes = n * 60;
  }
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return null;
  return roundTimeHour(totalMinutes / 60);
}

function formatDurationHours(hours) {
  const minutes = Math.max(0, Math.round(Number(hours || 0) * 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

function lightenHexColor(hex, amount = 0.18) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const mix = channel => Math.round(channel + (255 - channel) * amount);
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function formatDateKo(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatCalendarDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr || "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}. ${month}. ${day}.`;
}

function createDesignDateInput(initialValue) {
  const state = {
    value: initialValue || toDateStr(Date.now()),
    visibleMonth: new Date((initialValue || toDateStr(Date.now())) + "T00:00:00")
  };
  state.visibleMonth.setDate(1);

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const wrap = document.createElement("div");
  wrap.className = "hs2-date-picker";

  const input = document.createElement("input");
  input.type = "hidden";
  input.value = state.value;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "hs2-date-picker__button";

  const menu = document.createElement("div");
  menu.className = "hs2-date-picker__menu hidden";

  function syncButton() {
    button.textContent = formatCalendarDateLabel(state.value);
  }

  function selectDate(dateStr) {
    state.value = dateStr;
    input.value = dateStr;
    syncButton();
    menu.classList.add("hidden");
    wrap.classList.remove("open");
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function renderCalendar() {
    const year = state.visibleMonth.getFullYear();
    const month = state.visibleMonth.getMonth();
    const today = toDateStr(Date.now());
    const selected = state.value;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    menu.innerHTML = "";

    const header = document.createElement("div");
    header.className = "hs2-date-picker__header";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "hs2-date-picker__nav";
    prev.textContent = "‹";
    prev.setAttribute("aria-label", "이전 달");
    prev.addEventListener("click", (event) => {
      event.stopPropagation();
      state.visibleMonth.setMonth(state.visibleMonth.getMonth() - 1);
      renderCalendar();
    });

    const title = document.createElement("div");
    title.className = "hs2-date-picker__title";
    title.textContent = `${year}. ${String(month + 1).padStart(2, "0")}`;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "hs2-date-picker__nav";
    next.textContent = "›";
    next.setAttribute("aria-label", "다음 달");
    next.addEventListener("click", (event) => {
      event.stopPropagation();
      state.visibleMonth.setMonth(state.visibleMonth.getMonth() + 1);
      renderCalendar();
    });

    header.appendChild(prev);
    header.appendChild(title);
    header.appendChild(next);
    menu.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "hs2-date-picker__grid";
    weekdays.forEach(day => {
      const weekday = document.createElement("div");
      weekday.className = "hs2-date-picker__weekday";
      weekday.textContent = day;
      grid.appendChild(weekday);
    });
    for (let i = 0; i < firstDay; i++) {
      grid.appendChild(Object.assign(document.createElement("div"), { className: "hs2-date-picker__empty" }));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayBtn = document.createElement("button");
      dayBtn.type = "button";
      dayBtn.className = "hs2-date-picker__day";
      dayBtn.textContent = String(day);
      dayBtn.classList.toggle("selected", dateStr === selected);
      dayBtn.classList.toggle("today", dateStr === today);
      dayBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        selectDate(dateStr);
      });
      grid.appendChild(dayBtn);
    }
    menu.appendChild(grid);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !willOpen);
    wrap.classList.toggle("open", willOpen);
    if (willOpen) renderCalendar();
  });
  menu.addEventListener("pointerdown", event => event.stopPropagation());
  document.addEventListener("pointerdown", (event) => {
    if (!wrap.contains(event.target)) {
      menu.classList.add("hidden");
      wrap.classList.remove("open");
    }
  });

  syncButton();
  renderCalendar();
  wrap.appendChild(input);
  wrap.appendChild(button);
  wrap.appendChild(menu);
  return { el: wrap, input };
}

function isSameTblock(block, target) {
  if (!target) return false;
  if (target.id && block.id === target.id) return true;
  return !target.id && block.actId === target.actId && normalizeBlockType(block.type) === normalizeBlockType(target.type) && block.startH === target.startH && block.endH === target.endH;
}

function findOverlappingBlock(tlog, dateStr, startH, endH, options = {}) {
  const blocks = Array.isArray(tlog?.[dateStr]) ? tlog[dateStr] : [];
  return blocks.find(block => {
    if (options.ignoreBlock && isSameTblock(block, options.ignoreBlock)) return false;
    if (options.ignoreActId && block.actId === options.ignoreActId) return false;
    if (options.type && normalizeBlockType(block.type) !== normalizeBlockType(options.type)) return false;
    return Number(block.startH) < endH && Number(block.endH) > startH;
  }) || null;
}

function getOverlapMessage(overlap, dateStr) {
  const act = loadActs().find(a => a.id === overlap?.actId);
  const name = act?.name || "다른 활동";
  return `${formatDateKo(dateStr)} ${formatKoreanHour(overlap.startH)}에 ${name}과 겹쳐요.`;
}

function findFirstOverlapForDates(tlog, dates, startH, endH, options = {}) {
  for (const dt of dates) {
    const overlap = findOverlappingBlock(tlog, dt, startH, endH, options);
    if (overlap) return { date: dt, block: overlap };
  }
  return null;
}

function updateTlogBlockTime(dateStr, block, startH, endH) {
  const nextStart = roundTimeHour(startH);
  const nextEnd = roundTimeHour(endH);
  if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd) || nextStart < 0 || nextEnd > 24 || nextStart >= nextEnd) return false;

  const tlog = loadTlog();
  const overlap = findOverlappingBlock(tlog, dateStr, nextStart, nextEnd, {
    ignoreBlock: block,
    type: normalizeBlockType(block.type)
  });
  if (overlap) {
    alert("시간이 겹쳐요.");
    return false;
  }

  const blocks = Array.isArray(tlog[dateStr]) ? tlog[dateStr] : [];
  let changed = false;
  tlog[dateStr] = blocks.map(item => {
    if (!isSameTblock(item, block)) return item;
    changed = true;
    return { ...item, startH: nextStart, endH: nextEnd };
  });
  if (!changed) return false;
  tlog[dateStr].sort((a, b) => a.startH - b.startH);
  saveTlog(tlog);
  return true;
}

function createBlockTypeToggle(initialType = "plan", onChange) {
  let selectedType = normalizeBlockType(initialType);
  const wrap = document.createElement("div");
  wrap.className = "hs2-type-toggle";
  BLOCK_TYPES.forEach(type => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hs2-type-toggle__btn";
    btn.dataset.type = type.value;
    btn.textContent = type.label;
    btn.setAttribute("aria-pressed", String(type.value === selectedType));
    btn.addEventListener("click", () => {
      selectedType = type.value;
      wrap.querySelectorAll(".hs2-type-toggle__btn").forEach(item => {
        const selected = item.dataset.type === selectedType;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      onChange?.(selectedType);
    });
    wrap.appendChild(btn);
  });
  wrap.querySelector(`[data-type="${selectedType}"]`)?.classList.add("selected");
  return {
    el: wrap,
    get value() { return selectedType; },
    set value(type) {
      selectedType = normalizeBlockType(type);
      wrap.querySelectorAll(".hs2-type-toggle__btn").forEach(item => {
        const selected = item.dataset.type === selectedType;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
    },
  };
}

function createTimetableViewToggle() {
  const options = [
    { value: "plan", label: "계획" },
    { value: "actual", label: "실행" },
    { value: "both", label: "둘 다" },
  ];
  const wrap = document.createElement("div");
  wrap.className = "hs2-view-toggle";
  options.forEach(option => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hs2-view-toggle__btn";
    btn.dataset.view = option.value;
    btn.textContent = option.label;
    const selected = option.value === _timetableView;
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-pressed", String(selected));
    btn.addEventListener("click", () => {
      setTimetableView(option.value);
      renderHistoryScreen(_histDate);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function closeTimetableContextMenu() {
  document.querySelector(".hs2-context-menu")?.remove();
}

function openTimetableContextMenu(event, dateStr, block, act) {
  event.preventDefault();
  event.stopPropagation();
  closeTimetableContextMenu();

  const menu = document.createElement("div");
  menu.className = "hs2-context-menu";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;

  const title = document.createElement("div");
  title.className = "hs2-context-menu__title";
  title.textContent = `${act.name} · ${getBlockTypeLabel(block.type)}`;
  menu.appendChild(title);

  const addItem = (label, className, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hs2-context-menu__item" + (className ? ` ${className}` : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      closeTimetableContextMenu();
      onClick();
    });
    menu.appendChild(btn);
  };

  addItem("할 일 보기", "", () => _openTaskPanel(dateStr, block, act));
  addItem("시간 수정", "", () => _openBlockModal(dateStr, block.startH, block, () => renderHistoryScreen(_histDate)));
  addItem("삭제", "hs2-context-menu__item--danger", () => {
    const tlog = loadTlog();
    tlog[dateStr] = (tlog[dateStr] || []).filter(b => !isSameTblock(b, block));
    saveTlog(tlog);
    renderHistoryScreen(_histDate);
  });

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const x = Math.min(event.clientX, window.innerWidth - rect.width - 8);
  const y = Math.min(event.clientY, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;

  const closeOnOutside = (ev) => {
    if (menu.contains(ev.target)) return;
    closeTimetableContextMenu();
    document.removeEventListener("pointerdown", closeOnOutside);
    document.removeEventListener("keydown", closeOnEsc);
    document.removeEventListener("scroll", closeOnScroll, true);
  };
  const closeOnEsc = (ev) => {
    if (ev.key !== "Escape") return;
    closeTimetableContextMenu();
    document.removeEventListener("pointerdown", closeOnOutside);
    document.removeEventListener("keydown", closeOnEsc);
    document.removeEventListener("scroll", closeOnScroll, true);
  };
  const closeOnScroll = () => {
    closeTimetableContextMenu();
    document.removeEventListener("pointerdown", closeOnOutside);
    document.removeEventListener("keydown", closeOnEsc);
    document.removeEventListener("scroll", closeOnScroll, true);
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEsc);
    document.addEventListener("scroll", closeOnScroll, true);
  }, 0);
}

// ── Main render ──
let _restoreScrollTop = 0;

function renderHistoryScreen(dateStr, forceScrollTop) {
  const todayStr = toDateStr(Date.now());
  _histDate = dateStr || todayStr;
  _histWeekStart = getWeekStart(_histDate);

  // Save scroll position before destroying DOM
  const prevScroll = document.querySelector(".hs2-grid-scroll");
  if (forceScrollTop !== undefined) {
    _restoreScrollTop = forceScrollTop;
  } else if (prevScroll) {
    _restoreScrollTop = prevScroll.scrollTop;
  }

  const screen = document.getElementById("historyScreen");
  screen.innerHTML = "";
  _showEl(screen);

  // Clear previous sidebar clock interval
  if (window._hs2SbClockId) { clearInterval(window._hs2SbClockId); window._hs2SbClockId = null; }

  const dates = getWeekDates(_histWeekStart);

  // Two-panel layout (no separate topbar)
  const layout = document.createElement("div");
  layout.className = "hs2-layout";
  screen.appendChild(layout);

  // LEFT: sidebar
  const sidebar = document.createElement("div");
  sidebar.className = "hs2-sidebar";
  layout.appendChild(sidebar);
  _renderSidebar(sidebar, dates);

  // RIGHT: grid panel
  const gridPanel = document.createElement("div");
  gridPanel.className = "hs2-grid-panel";
  layout.appendChild(gridPanel);
  _renderWeekGrid(gridPanel, dates);

  // (scroll restoration no longer needed — grid shows all 24h without scrolling)
}

// ── Unified sidebar — Porto Rocha style ──
function _renderSidebar(sidebar, dates) {
  sidebar.innerHTML = "";

  // ── LOGO ──
  const logo = document.createElement("div");
  logo.className = "hs2-sb-logo";
  logo.textContent = "DAYOS";
  sidebar.appendChild(logo);

  // ── CLOCK block (Porto Rocha: big date + time, centered, breathing room) ──
  const clockBlock = document.createElement("div");
  clockBlock.className = "hs2-sb-clock";

  const DAYS_KO = ["일","월","화","수","목","금","토"];
  const now = new Date();
  const dateEl = document.createElement("div");
  dateEl.className = "hs2-sb-date";
  dateEl.textContent = `${now.getMonth()+1}월 ${now.getDate()}일 · ${DAYS_KO[now.getDay()]}요일`;
  clockBlock.appendChild(dateEl);

  const timeEl = document.createElement("div");
  timeEl.className = "hs2-sb-time";
  timeEl.textContent = formatClock();
  clockBlock.appendChild(timeEl);

  sidebar.appendChild(clockBlock);

  window._hs2SbClockId = setInterval(() => {
    timeEl.textContent = formatClock();
    const d = new Date();
    dateEl.textContent = `${d.getMonth()+1}월 ${d.getDate()}일 · ${DAYS_KO[d.getDay()]}요일`;
  }, 1000);

  // ── SPACER ──
  const spacer = document.createElement("div");
  spacer.className = "hs2-sb-spacer";
  sidebar.appendChild(spacer);

  // ── ACTS header ──
  const actsHeader = document.createElement("div");
  actsHeader.className = "hs2-sb-acts-header";
  const actsLabel = document.createElement("span");
  actsLabel.className = "hs2-sb-acts-label";
  actsLabel.textContent = "활동";
  actsHeader.appendChild(actsLabel);
  const addActBtn = document.createElement("button");
  addActBtn.className = "hs2-sb-add-btn";
  addActBtn.type = "button";
  addActBtn.title = "활동 추가";
  addActBtn.setAttribute("aria-label", "활동 추가");
  addActBtn.textContent = "+";
  addActBtn.addEventListener("click", () => _openActModal(null, () => renderHistoryScreen(_histDate)));
  actsHeader.appendChild(addActBtn);
  sidebar.appendChild(actsHeader);

  // ── ACTIVITY list ──
  _renderActSidebar(sidebar, dates);
}

// ── Activity cards (appended into sidebar, no innerHTML reset) ──
function _renderActSidebar(sidebar, dates) {
  const acts = loadActs();
  const tlog = loadTlog();

  acts.forEach(act => {
    // Sidebar chips show the selected day's total, not the whole week.
    const selectedDate = _histDate || toDateStr(Date.now());
    let planMs = 0;
    let actualMs = 0;
    const blocks = (tlog[selectedDate] || []).filter(b => b.actId === act.id);
    blocks.forEach(b => {
      const ms = (b.endH - b.startH) * 3600000;
      if (normalizeBlockType(b.type) === "plan") planMs += ms;
      else actualMs += ms;
    });
    const visibleMs = planMs > 0 ? planMs : actualMs;
    const totalH = Math.round(visibleMs / 3600000 * 10) / 10;

    const card = document.createElement("div");
    card.className = "hs2-act-card";
    card.dataset.actId = act.id;
    card.style.position = "relative";
    card.addEventListener("click", (e) => {
      if (e.target.closest(".hs2-act-dots") || e.target.closest(".hs2-act-dots-menu")) return;
      _openAddBlockModal(act);
    });

    // color dot
    const dot = document.createElement("div");
    dot.className = "hs2-act-dot";
    dot.style.background = act.color || "#E64040";
    card.appendChild(dot);

    // name label blob
    const label = document.createElement("div");
    label.className = "hs2-act-label";
    label.style.background = act.color || "#E64040";
    label.textContent = act.name;
    card.appendChild(label);

    // goal / logged time chip
    if (act.goalH || totalH > 0) {
      const timeChip = document.createElement("div");
      timeChip.className = "hs2-act-goal";
      if (totalH > 0) {
        timeChip.textContent = totalH % 1 === 0 ? `${totalH}H` : `${totalH}H`;
      } else if (act.goalH) {
        timeChip.textContent = `목표 ${act.goalH}H`;
        timeChip.style.opacity = "0.55";
      }
      card.appendChild(timeChip);
    }

    // right-side action group
    const rightGroup = document.createElement("div");
    rightGroup.className = "hs2-act-right";

    // three-dot menu
    const dots = document.createElement("button");
    dots.className = "hs2-act-dots";
    dots.textContent = "⋯";
    dots.addEventListener("click", (e) => {
      e.stopPropagation();
      const existingMenu = rightGroup.querySelector(".hs2-act-dots-menu");
      document.querySelectorAll(".hs2-act-card--menu-open").forEach(c => c.classList.remove("hs2-act-card--menu-open"));
      document.querySelectorAll(".hs2-act-dots-menu").forEach(m => m.remove());
      if (existingMenu) return;

      const menu = document.createElement("div");
      menu.className = "hs2-act-dots-menu";
      card.classList.add("hs2-act-card--menu-open");
      const closeMenu = () => {
        menu.remove();
        card.classList.remove("hs2-act-card--menu-open");
        document.removeEventListener("pointerdown", outsideClose);
      };
      const outsideClose = (ev) => {
        if (menu.contains(ev.target) || dots.contains(ev.target)) return;
        closeMenu();
      };
      menu.addEventListener("pointerdown", ev => ev.stopPropagation());
      menu.addEventListener("click", ev => ev.stopPropagation());

      const editBtn = document.createElement("button");
      editBtn.className = "hs2-act-dots-item";
      editBtn.textContent = "수정";
      editBtn.addEventListener("click", () => {
        closeMenu();
        _openActModal(act.id, () => renderHistoryScreen(_histDate));
      });
      const delBtn = document.createElement("button");
      delBtn.className = "hs2-act-dots-item hs2-act-dots-item--del";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", () => {
        closeMenu();
        const acts2 = loadActs().filter(a => a.id !== act.id);
        saveActs(acts2);
        renderHistoryScreen(_histDate);
      });
      menu.appendChild(editBtn);
      menu.appendChild(delBtn);
      rightGroup.appendChild(menu);
      setTimeout(() => document.addEventListener("pointerdown", outsideClose), 0);
    });
    rightGroup.appendChild(dots);
    card.appendChild(rightGroup);

    sidebar.appendChild(card);
  });

}

// ── Add block modal ──
function _openAddBlockModal(act) {
  document.querySelector(".hs2-add-block-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "hs2-add-block-overlay";

  const modal = document.createElement("div");
  modal.className = "hs2-add-block-modal";

  // Header
  const hdr = document.createElement("div");
  hdr.className = "hs2-abm-header";
  const hdot = document.createElement("div");
  hdot.className = "hs2-abm-dot";
  hdot.style.background = act.color || "#555";
  const htitle = document.createElement("div");
  htitle.className = "hs2-abm-title";
  htitle.textContent = act.name + " 추가";
  const hclose = document.createElement("button");
  hclose.className = "hs2-abm-close";
  hclose.textContent = "×";
  hclose.addEventListener("click", () => overlay.remove());
  hdr.appendChild(hdot); hdr.appendChild(htitle); hdr.appendChild(hclose);
  modal.appendChild(hdr);

  // Fields
  const fields = document.createElement("div");
  fields.className = "hs2-abm-fields";

  function _row(labelText, input) {
    const row = document.createElement("div");
    row.className = "hs2-abm-row";
    const lbl = document.createElement("label");
    lbl.className = "hs2-abm-label";
    lbl.textContent = labelText;
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  // Date input
  const datePicker = createDesignDateInput(_histDate || toDateStr(Date.now()));
  const dateInput = datePicker.input;
  fields.appendChild(_row("날짜", datePicker.el));

  let repeatRow;
  const syncRepeatVisibility = (type) => {
    const isActual = normalizeBlockType(type) === "actual";
    repeatRow?.classList.toggle("hidden", isActual);
    customRepeatWrap?.classList.toggle("hidden", isActual || repeatSel.value !== "custom");
    if (isActual) repeatSel.value = "none";
  };

  const typeToggle = createBlockTypeToggle("plan", syncRepeatVisibility);
  fields.appendChild(_row("구분", typeToggle.el));

  const startInput = document.createElement("input");
  startInput.className = "hs2-abm-input hs2-abm-input--time";
  startInput.type = "time";
  startInput.value = formatTime24(act.defaultStartH ?? 22);

  const endInput = document.createElement("input");
  endInput.className = "hs2-abm-input hs2-abm-input--time";
  endInput.type = "time";
  endInput.value = formatTime24(act.defaultEndH ?? Math.min((act.defaultStartH ?? 22) + (act.defaultDuration ?? 1), 24));

  fields.appendChild(_row("시작", startInput));
  fields.appendChild(_row("종료", endInput));

  // Repeat
  const repeatSel = document.createElement("select");
  repeatSel.className = "hs2-abm-input";
  [["none","안함"], ["daily","매일"], ["weekly","매주"], ["biweekly","2주마다"], ["monthly","매월"], ["yearly","매년"], ["custom","사용자화"]].forEach(([v, t]) => {
    const o = document.createElement("option"); o.value = v; o.textContent = t;
    repeatSel.appendChild(o);
  });
  repeatRow = _row("반복", repeatSel);
  fields.appendChild(repeatRow);

  const customRepeatWrap = document.createElement("div");
  customRepeatWrap.className = "hs2-abm-custom-repeat hidden";
  const repeatUnitSel = document.createElement("select");
  repeatUnitSel.className = "hs2-abm-input";
  [["daily","매일"], ["weekly","매주"], ["monthly","매월"], ["yearly","매년"]].forEach(([v, t]) => {
    const o = document.createElement("option"); o.value = v; o.textContent = t;
    repeatUnitSel.appendChild(o);
  });
  const repeatEveryInput = document.createElement("input");
  repeatEveryInput.type = "number";
  repeatEveryInput.min = "1";
  repeatEveryInput.max = "365";
  repeatEveryInput.step = "1";
  repeatEveryInput.value = "1";
  repeatEveryInput.className = "hs2-abm-input";
  customRepeatWrap.appendChild(_row("반복 주기", repeatUnitSel));
  customRepeatWrap.appendChild(_row("반복", repeatEveryInput));
  fields.appendChild(customRepeatWrap);
  repeatSel.addEventListener("change", () => {
    syncRepeatVisibility(typeToggle.value);
  });
  repeatEveryInput.addEventListener("input", () => {
    repeatEveryInput.value = clampRepeatEvery(repeatEveryInput.value);
  });

  modal.appendChild(fields);
  syncRepeatVisibility(typeToggle.value);

  const errorMsg = document.createElement("div");
  errorMsg.className = "hs2-modal-error hidden";
  modal.appendChild(errorMsg);

  const setError = (message) => {
    errorMsg.textContent = message || "";
    errorMsg.classList.toggle("hidden", !message);
  };

  // Buttons
  const btns = document.createElement("div");
  btns.className = "hs2-abm-btns";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "hs2-abm-btn hs2-abm-btn--cancel";
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", () => overlay.remove());
  const saveBtn = document.createElement("button");
  saveBtn.className = "hs2-abm-btn hs2-abm-btn--save";
  saveBtn.textContent = "추가";
  saveBtn.addEventListener("click", () => {
    const date = dateInput.value;
    const s = parseTime24(startInput.value);
    const en = parseTime24(endInput.value);
    const type = typeToggle.value;
    const repeat = type === "actual" ? "none" : repeatSel.value;
    if (!date) return;
    if (s === null || en === null || en <= s) {
      setError("시간을 확인해주세요.");
      return;
    }

    const dates = buildRepeatDates(date, repeat, repeatUnitSel.value, repeatEveryInput.value);

    const tlog = loadTlog();
    const conflict = findFirstOverlapForDates(tlog, dates, s, en, { ignoreActId: act.id, type });
    if (conflict) {
      setError(getOverlapMessage(conflict.block, conflict.date));
      return;
    }

    for (const dt of dates) {
      if (!tlog[dt]) tlog[dt] = [];
      tlog[dt] = tlog[dt].filter(b => !(b.actId === act.id && normalizeBlockType(b.type) === type && b.startH < en && b.endH > s));
      tlog[dt].push({ actId: act.id, startH: s, endH: en, type });
      // merge adjacent
      tlog[dt].sort((a, b) => a.startH - b.startH);
      const merged = [];
      for (const blk of tlog[dt]) {
        const last = merged[merged.length - 1];
        if (last && last.actId === blk.actId && normalizeBlockType(last.type) === normalizeBlockType(blk.type) && last.endH >= blk.startH) {
          last.endH = Math.max(last.endH, blk.endH);
        } else { merged.push({ ...blk }); }
      }
      tlog[dt] = merged;
    }
    localStorage.setItem(TLOG_KEY, JSON.stringify(tlog));
    setTimetableView(type);
    overlay.remove();
    renderHistoryScreen(_histDate);
  });
  btns.appendChild(cancelBtn);
  btns.appendChild(saveBtn);
  modal.appendChild(btns);

  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("historyScreen").appendChild(overlay);
}

// ── Task panel (slide-in from right) ──
function _openTaskPanel(date, block, act) {
  document.querySelector(".hs2-task-panel")?.remove();

  const panel = document.createElement("div");
  panel.className = "hs2-task-panel";

  // Header
  const header = document.createElement("div");
  header.className = "hs2-tp-header";

  // Top row: dot + name + close
  const headerTop = document.createElement("div");
  headerTop.className = "hs2-tp-header-top";
  const dot = document.createElement("div");
  dot.className = "hs2-tp-dot";
  dot.style.background = act.color || "#555";
  const title = document.createElement("div");
  title.className = "hs2-tp-title";
  title.textContent = `${act.name} · ${getBlockTypeLabel(block.type)}`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "hs2-tp-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => panel.remove());
  headerTop.appendChild(dot);
  headerTop.appendChild(title);
  headerTop.appendChild(closeBtn);
  header.appendChild(headerTop);

  // Meta: date + time range with duration
  const d = new Date(date + "T00:00:00");
  const dayNames = ["일","월","화","수","목","금","토"];
  const dateStr = `${d.getMonth()+1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
  const dur = block.endH - block.startH;
  const durStr = formatDurationHours(dur);
  const meta = document.createElement("div");
  meta.className = "hs2-tp-meta";
  const metaDate = document.createElement("div");
  metaDate.className = "hs2-tp-meta-date";
  metaDate.textContent = dateStr;
  const metaTime = document.createElement("div");
  metaTime.className = "hs2-tp-meta-time";
  metaTime.textContent = `${formatTimeInput(block.startH)} - ${formatTimeInput(block.endH)} · ${durStr}`;
  meta.appendChild(metaDate);
  meta.appendChild(metaTime);
  header.appendChild(meta);
  panel.appendChild(header);

  // Task list
  const taskList = document.createElement("div");
  taskList.className = "hs2-tp-tasks";
  panel.appendChild(taskList);

  if (!block.tasks) block.tasks = [];

  function _saveTasks() {
    const tlog = loadTlog();
    const blocks = tlog[date] || [];
    const idx = blocks.findIndex(b => isSameTblock(b, block));
    if (idx !== -1) {
      blocks[idx].tasks = block.tasks;
      localStorage.setItem(TLOG_KEY, JSON.stringify(tlog));
    }
    // refresh badge on the time block without full re-render
    document.querySelectorAll(".hs2-time-block").forEach(tb => {
      const lbl = tb.querySelector(".hs2-time-block-label");
      if (lbl && lbl.textContent === act.name) {
        const top = parseInt(tb.style.top);
        if (top === block.startH * 44) {
          let badge = tb.querySelector(".hs2-block-badge");
          if (!badge) { badge = document.createElement("div"); badge.className = "hs2-block-badge"; tb.appendChild(badge); }
          const done = block.tasks.filter(t => t.done).length;
          badge.textContent = `${done}/${block.tasks.length}`;
        }
      }
    });
  }

  function _renderTasks() {
    taskList.innerHTML = "";
    block.tasks.forEach((task, i) => {
      const row = document.createElement("div");
      row.className = "hs2-tp-task" + (task.done ? " done" : "");
      const cb = document.createElement("div");
      cb.className = "hs2-tp-check" + (task.done ? " done" : "");
      cb.textContent = task.done ? "✓" : "";
      cb.addEventListener("click", () => {
        task.done = !task.done;
        _saveTasks();
        _renderTasks();
      });
      const txt = document.createElement("span");
      txt.className = "hs2-tp-task-text";
      txt.textContent = task.text;
      const del = document.createElement("button");
      del.className = "hs2-tp-del";
      del.textContent = "×";
      del.addEventListener("click", () => {
        block.tasks.splice(i, 1);
        _saveTasks();
        _renderTasks();
      });
      row.appendChild(cb);
      row.appendChild(txt);
      row.appendChild(del);
      taskList.appendChild(row);
    });
  }
  _renderTasks();

  // Add task input
  const addRow = document.createElement("div");
  addRow.className = "hs2-tp-add-row";
  const input = document.createElement("input");
  input.className = "hs2-tp-input";
  input.placeholder = "할 일 추가...";
  input.type = "text";
  function _addTask() {
    const text = input.value.trim();
    if (!text) return;
    block.tasks.push({ id: Date.now().toString(), text, done: false });
    _saveTasks();
    _renderTasks();
    input.value = "";
    input.focus();
  }
  input.addEventListener("keydown", e => { if (e.key === "Enter") _addTask(); });
  const addBtn = document.createElement("button");
  addBtn.className = "hs2-tp-add-btn";
  addBtn.textContent = "+";
  addBtn.addEventListener("click", _addTask);
  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  panel.appendChild(addRow);

  // Delete block button
  const delBlock = document.createElement("button");
  delBlock.className = "hs2-tp-del-block";
  delBlock.textContent = "블록 삭제";
  delBlock.addEventListener("click", () => {
    const tlog = loadTlog();
    if (tlog[date]) {
      tlog[date] = tlog[date].filter(b => !isSameTblock(b, block));
      localStorage.setItem(TLOG_KEY, JSON.stringify(tlog));
    }
    panel.remove();
    renderHistoryScreen(_histDate);
  });
  panel.appendChild(delBlock);

  // Append to historyScreen
  document.getElementById("historyScreen").appendChild(panel);
  setTimeout(() => panel.classList.add("open"), 10);

  // Close on outside click
  const outsideClose = (e) => {
    if (!panel.contains(e.target) && !e.target.closest(".hs2-time-block")) {
      panel.remove();
      document.removeEventListener("pointerdown", outsideClose);
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", outsideClose), 100);
}

// ── Inline paint mode (replaces grid panel content) ──
function _openPaintOverlay(defaultActId) {
  const gridPanel = document.querySelector(".hs2-grid-panel");
  if (!gridPanel) return;
  const acts = loadActs();
  if (!acts.length) return;

  pruneTlogForActs(loadTlog(), acts);

  let selectedActId = acts.some(a => a.id === defaultActId) ? defaultActId : acts[0].id;
  let selectedBlockType = "plan";

  // Clear grid panel, replace with edit mode UI
  gridPanel.innerHTML = "";
  gridPanel.classList.add("hs2-pedit-active");

  // ── Topbar: palette + 완료 ──
  const topbar = document.createElement("div");
  topbar.className = "hs2-pedit-topbar";

  const palette = document.createElement("div");
  palette.className = "hs2-pedit-palette";
  function setSelectedAct(actId) {
    if (!acts.some(a => a.id === actId)) return;
    selectedActId = actId;
    palette.querySelectorAll(".hs2-pedit-chip").forEach(c => {
      c.classList.toggle("selected", c.dataset.actId === selectedActId);
    });
  }
  acts.forEach(act => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.dataset.actId = act.id;
    chip.className = "hs2-pedit-chip" + (act.id === selectedActId ? " selected" : "");
    if (act.id === selectedActId) chip.scrollIntoView({ block: "nearest", inline: "center" });
    chip.style.background = act.color || "#555";
    chip.textContent = act.name;
    chip.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedAct(act.id);
    });
    chip.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedAct(act.id);
    });
    palette.appendChild(chip);
  });
  topbar.appendChild(palette);

  const typeToggle = createBlockTypeToggle(selectedBlockType, type => {
    selectedBlockType = type;
    refreshCells();
  });
  topbar.appendChild(typeToggle.el);

  const doneBtn = document.createElement("button");
  doneBtn.className = "hs2-pedit-done";
  doneBtn.textContent = "완료";
  doneBtn.addEventListener("click", () => {
    gridPanel.classList.remove("hs2-pedit-active");
    renderHistoryScreen(_histDate);
  });
  topbar.appendChild(doneBtn);
  gridPanel.appendChild(topbar);

  // ── Day headers ──
  const DAYS_EN = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
  const todayStr = toDateStr(Date.now());
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(_histWeekStart + "T00:00:00");
    d.setDate(d.getDate() + i);
    dates.push(toDateStr(d.getTime()));
  }

  const dayHdrs = document.createElement("div");
  dayHdrs.className = "hs2-pedit-day-hdrs";
  dayHdrs.appendChild(document.createElement("div")); // corner
  dates.forEach((dt, i) => {
    const d = new Date(dt + "T00:00:00");
    const hdr = document.createElement("div");
    hdr.className = "hs2-pedit-day-hdr" + (dt === todayStr ? " is-today" : "");
    hdr.innerHTML = `<span class="hs2-pedit-day-name">${DAYS_EN[i]}</span><span class="hs2-pedit-day-num">${d.getDate()}</span>`;
    dayHdrs.appendChild(hdr);
  });
  gridPanel.appendChild(dayHdrs);

  // ── Grid body: separate time col (no gap lines) + 7-day CSS grid ──
  // Use _cachedHourH so rows match normal mode exactly
  const HOUR_H = _cachedHourH;
  const GAP = 1;
  const bodyH = HOUR_H * 24 + 23 * GAP;

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "hs2-pedit-body";
  bodyWrap.style.height = bodyH + "px";

  const timeColDiv = document.createElement("div");
  timeColDiv.className = "hs2-pedit-time-col";

  const gridBody = document.createElement("div");
  gridBody.className = "hs2-pedit-grid";
  gridBody.style.gridTemplateRows = `repeat(24, ${HOUR_H}px)`;
  gridBody.style.touchAction = "none";

  const cellMap = {};
  for (let h = 0; h < 24; h++) {
    const timeLbl = document.createElement("div");
    timeLbl.className = "hs2-pedit-time-lbl";
    timeLbl.style.height = (HOUR_H + 1) + "px";
    timeLbl.textContent = h === 0 ? "24" : `${h}`;
    timeColDiv.appendChild(timeLbl);
    dates.forEach(dt => {
      const cell = document.createElement("div");
      cell.className = "hs2-pedit-cell";
      cell.dataset.dt = dt;
      cell.dataset.h = h;
      cellMap[`${dt}_${h}`] = cell;
      gridBody.appendChild(cell);
    });
  }
  bodyWrap.appendChild(timeColDiv);
  bodyWrap.appendChild(gridBody);
  gridPanel.appendChild(bodyWrap);

  function refreshCells() {
    const tlog = pruneTlogForActs(loadTlog(), acts);
    for (let h = 0; h < 24; h++) {
      dates.forEach(dt => {
        const cell = cellMap[`${dt}_${h}`];
        if (!cell) return;
        const blk = (tlog[dt] || []).find(b => normalizeBlockType(b.type) === selectedBlockType && b.startH <= h && b.endH > h);
        if (blk) {
          const act = acts.find(a => a.id === blk.actId);
          cell.style.background = act ? (act.color || "#555") : "transparent";
        } else {
          cell.style.background = "transparent";
        }
      });
    }
  }
  refreshCells();

  function mergeBlocks(blocks) {
    blocks.sort((a, b) => a.startH - b.startH);
    const merged = [];
    for (const blk of blocks) {
      const last = merged[merged.length - 1];
        if (last && last.actId === blk.actId && normalizeBlockType(last.type) === normalizeBlockType(blk.type) && last.endH >= blk.startH) {
        last.endH = Math.max(last.endH, blk.endH);
      } else { merged.push({ ...blk }); }
    }
    return merged;
  }

  let painting = false, erasing = false, paintDt = null, paintStartH = null, paintEndH = null;

  function paintPreview() {
    if (!painting || !paintDt) return;
    refreshCells();
    const s = Math.min(paintStartH, paintEndH);
    const en = Math.max(paintStartH, paintEndH);
    const act = acts.find(a => a.id === selectedActId);
    if (!act) return;
    const actColor = act.color || "#555";
    for (let hh = 0; hh < 24; hh++) {
      const c = cellMap[`${paintDt}_${hh}`];
      if (!c) continue;
      if (hh >= s && hh <= en) c.style.background = erasing ? "transparent" : actColor;
    }
  }

  function commitPaint() {
    if (!paintDt || paintStartH === null || paintEndH === null) return;
    if (!acts.some(a => a.id === selectedActId)) return;
    const s = Math.min(paintStartH, paintEndH);
    const en = Math.max(paintStartH, paintEndH) + 1;
    const tlog = pruneTlogForActs(loadTlog(), acts);
    if (!tlog[paintDt]) tlog[paintDt] = [];
    if (erasing) {
      // Split or trim blocks that overlap the erased range
      const newBlocks = [];
      for (const b of tlog[paintDt]) {
        if (b.actId !== selectedActId || normalizeBlockType(b.type) !== selectedBlockType || b.endH <= s || b.startH >= en) {
          newBlocks.push(b); // no overlap, keep
        } else {
          if (b.startH < s) newBlocks.push({ ...b, endH: s }); // keep left part
          if (b.endH > en) newBlocks.push({ ...b, startH: en }); // keep right part
        }
      }
      tlog[paintDt] = newBlocks;
    } else {
      const newBlocks = [];
      for (const b of tlog[paintDt]) {
        if (normalizeBlockType(b.type) !== selectedBlockType || b.endH <= s || b.startH >= en) {
          newBlocks.push(b);
        } else {
          if (b.startH < s) newBlocks.push({ ...b, endH: s });
          if (b.endH > en) newBlocks.push({ ...b, startH: en });
        }
      }
      tlog[paintDt] = newBlocks;
      tlog[paintDt].push({ actId: selectedActId, startH: s, endH: en, type: selectedBlockType });
      tlog[paintDt] = mergeBlocks(tlog[paintDt]);
    }
    localStorage.setItem(TLOG_KEY, JSON.stringify(tlog));
    refreshCells();
  }

  gridBody.addEventListener("pointerdown", e => {
    const cell = e.target.closest(".hs2-pedit-cell");
    if (!cell) return;
    e.preventDefault();
    painting = true;
    paintDt = cell.dataset.dt;
    paintStartH = parseInt(cell.dataset.h);
    paintEndH = paintStartH;
    // Check if this cell already has the selected activity → erase mode
    const tlog = loadTlog();
    const existingBlk = (tlog[paintDt] || []).find(b => b.actId === selectedActId && normalizeBlockType(b.type) === selectedBlockType && b.startH <= paintStartH && b.endH > paintStartH);
    erasing = !!existingBlk;
    gridBody.setPointerCapture(e.pointerId);
    paintPreview();
  }, { passive: false });

  gridBody.addEventListener("pointermove", e => {
    if (!painting) return;
    e.preventDefault();
    const cell = e.target.closest(".hs2-pedit-cell");
    if (!cell || cell.dataset.dt !== paintDt) return;
    const h = parseInt(cell.dataset.h);
    if (h === paintEndH) return;
    paintEndH = h;
    paintPreview();
  }, { passive: false });

  gridBody.addEventListener("pointerup", () => {
    if (!painting) return;
    painting = false;
    commitPaint();
    paintDt = null; paintStartH = null; paintEndH = null;
  });

  // ESC to exit
  const escHandler = e => {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", escHandler);
      gridPanel.classList.remove("hs2-pedit-active");
      renderHistoryScreen(_histDate);
    }
  };
  document.addEventListener("keydown", escHandler);
}

// ── Week grid ──
function _renderWeekGrid(gridPanel, dates) {
  const todayStr = toDateStr(Date.now());
  const DAYS_EN = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
  const acts = loadActs();
  const tlog = pruneTlogForActs(loadTlog(), acts);
  const MOVE_STEP = 0.25;

  function startBlockMove(event, dateStr, block, hourH) {
    const blockType = normalizeBlockType(block.type);
    if (!["plan", "actual"].includes(blockType) || _timetableView !== blockType) return;
    event.preventDefault();
    event.stopPropagation();
    closeTimetableContextMenu();

    const startY = event.clientY;
    const initialStart = Number(block.startH);
    const initialEnd = Number(block.endH);
    const duration = initialEnd - initialStart;
    const target = event.currentTarget.closest(".hs2-block-hover-zone");
    const blockItems = [...gridPanel.querySelectorAll(".hs2-cell-segment")].filter(item => item.dataset.blockKey === target?.dataset.blockKey);
    target?.setPointerCapture?.(event.pointerId);
    target?.classList.add("is-moving");
    target.dataset.dragged = "false";
    const originalTimeLabel = target.dataset.timeLabel || "";
    const moveTooltip = document.createElement("div");
    moveTooltip.className = "hs2-drag-time-tooltip";
    document.body.appendChild(moveTooltip);
    const updateMoveTooltip = (clientX, clientY, startH, endH) => {
      moveTooltip.textContent = `${formatTimeInput(startH)} - ${formatTimeInput(endH)}`;
      moveTooltip.style.left = `${clientX}px`;
      moveTooltip.style.top = `${Math.max(8, clientY - 34)}px`;
    };
    updateMoveTooltip(event.clientX, event.clientY, initialStart, initialEnd);

    const onMove = moveEvent => {
      moveEvent.preventDefault();
      const rawDelta = moveEvent.clientY - startY;
      if (Math.abs(rawDelta) > 3) target.dataset.dragged = "true";
      const delta = Math.round(rawDelta / (hourH * MOVE_STEP)) * MOVE_STEP;
      const nextStart = Math.min(24 - duration, Math.max(0, initialStart + delta));
      const nextEnd = nextStart + duration;
      const transform = `translateY(${(nextStart - initialStart) * hourH}px)`;
      target.style.transform = transform;
      updateMoveTooltip(moveEvent.clientX, moveEvent.clientY, nextStart, nextEnd);
      blockItems.forEach(item => { item.style.transform = transform; });
    };

    const onUp = upEvent => {
      target?.releasePointerCapture?.(upEvent.pointerId);
      target?.classList.remove("is-moving");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      const delta = Math.round((upEvent.clientY - startY) / (hourH * MOVE_STEP)) * MOVE_STEP;
      const nextStart = Math.min(24 - duration, Math.max(0, initialStart + delta));
      const nextEnd = nextStart + duration;

      if (target.dataset.dragged === "true" && nextStart !== initialStart) {
        target.dataset.suppressClick = "true";
        setTimeout(() => { delete target.dataset.suppressClick; }, 0);
        updateTlogBlockTime(dateStr, block, nextStart, nextEnd);
      }
      delete target.dataset.dragged;
      target.dataset.timeLabel = originalTimeLabel;
      moveTooltip.remove();
      renderHistoryScreen(_histDate);
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp, { once: true });
  }

  // Auto-switch removed: user's explicit tab selection should be respected.

  // Topbar (week nav)
  const topbar = document.createElement("div");
  topbar.className = "hs2-grid-topbar";

  const wsD = new Date(_histWeekStart + "T00:00:00");
  const weD = new Date(_histWeekStart + "T00:00:00"); weD.setDate(weD.getDate() + 6);
  const sameMonth = wsD.getMonth() === weD.getMonth();
  const label = document.createElement("span");
  label.className = "hs2-grid-date-label";
  label.textContent = sameMonth
    ? `${wsD.getMonth()+1}월 ${wsD.getDate()}일 - ${weD.getDate()}일`
    : `${wsD.getMonth()+1}월 ${wsD.getDate()}일 - ${weD.getMonth()+1}월 ${weD.getDate()}일`;
  label.title = "오늘 주로 이동";
  label.addEventListener("click", () => {
    _histDate = toDateStr(Date.now());
    _histWeekStart = getWeekStart(_histDate);
    renderHistoryScreen(_histDate);
  });

  const prevBtn = document.createElement("button");
  prevBtn.className = "hs2-grid-nav-btn";
  prevBtn.textContent = "‹";
  prevBtn.addEventListener("click", () => {
    const d = new Date(_histWeekStart + "T00:00:00");
    d.setDate(d.getDate() - 7);
    _histWeekStart = toDateStr(d.getTime());
    _histDate = _histWeekStart;
    renderHistoryScreen(_histDate);
  });

  const nextBtn = document.createElement("button");
  nextBtn.className = "hs2-grid-nav-btn";
  nextBtn.textContent = "›";
  nextBtn.addEventListener("click", () => {
    const d = new Date(_histWeekStart + "T00:00:00");
    d.setDate(d.getDate() + 7);
    _histWeekStart = toDateStr(d.getTime());
    _histDate = _histWeekStart;
    renderHistoryScreen(_histDate);
  });

  const weekNav = document.createElement("div");
  weekNav.className = "hs2-week-nav";
  weekNav.appendChild(prevBtn);
  weekNav.appendChild(label);
  weekNav.appendChild(nextBtn);
  topbar.appendChild(weekNav);
  topbar.appendChild(createTimetableViewToggle());

  gridPanel.appendChild(topbar);

  // Day headers
  const dayHeaders = document.createElement("div");
  dayHeaders.className = "hs2-grid-day-headers";
  // empty corner cell
  const corner = document.createElement("div");
  dayHeaders.appendChild(corner);

  dates.forEach((dt, i) => {
    const d = new Date(dt + "T00:00:00");
    const isToday = dt === todayStr;
    const cell = document.createElement("div");
    cell.className = "hs2-grid-day-hdr" + (isToday ? " is-today" : "");
    const dayName = document.createElement("span");
    dayName.textContent = DAYS_EN[i];
    const dayNum = document.createElement("span");
    dayNum.className = "hs2-grid-day-num";
    dayNum.textContent = d.getDate();
    cell.appendChild(dayName);
    cell.appendChild(dayNum);
    dayHeaders.appendChild(cell);
  });
  gridPanel.appendChild(dayHeaders);

  // Calculate HOUR_H to fit all 24h without scroll (account for 23 x 1px gaps)
  const GAP = 1;
  const availableH = gridPanel.clientHeight - topbar.offsetHeight - dayHeaders.offsetHeight;
  const HOUR_H = Math.max(Math.floor((availableH - 23 * GAP) / 24), 20);
  _cachedHourH = HOUR_H; // save for paint overlay to reuse

  // Grid container (no scroll)
  const scroll = document.createElement("div");
  scroll.className = "hs2-grid-scroll";
  scroll.style.overflow = "hidden";
  scroll.style.flex = "1";
  gridPanel.appendChild(scroll);

  const body = document.createElement("div");
  body.className = "hs2-grid-body";
  body.style.height = (HOUR_H * 24 + 23 * GAP) + "px";
  body.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".hs2-cell-segment")) return;
    event.preventDefault();
    closeTimetableContextMenu();
  });
  scroll.appendChild(body);

  // Time labels column
  const timeCol = document.createElement("div");
  timeCol.className = "hs2-grid-time-col";
  for (let h = 0; h < 24; h++) {
    const lbl = document.createElement("div");
    lbl.className = "hs2-grid-hour-label";
    lbl.style.height = (HOUR_H + 1) + "px";
    lbl.textContent = h === 0 ? "24" : `${h}`;
    timeCol.appendChild(lbl);
  }
  body.appendChild(timeCol);

  // Day columns — cell-based rendering (like paint mode)
  dates.forEach((dt) => {
    const col = document.createElement("div");
    col.className = "hs2-grid-day-col";
    col.dataset.date = dt;

    const blocks = (tlog[dt] || []).filter(b => acts.some(a => a.id === b.actId));

    for (let h = 0; h < 24; h++) {
      const cell = document.createElement("div");
      cell.className = "hs2-grid-hour-cell";
      cell.style.height = HOUR_H + "px";
      cell.dataset.date = dt;
      cell.dataset.hour = h;

      // Plan and actual can coexist in the same hour.
      const hourBlocks = blocks.filter(b => b.startH < h + 1 && b.endH > h);
      const planBlk = shouldShowBlockType("plan") ? hourBlocks.find(b => normalizeBlockType(b.type) === "plan") : null;
      const actualBlk = shouldShowBlockType("actual") ? hourBlocks.find(b => normalizeBlockType(b.type) === "actual") : null;

      function renderCellSegment(blk, type) {
        if (!blk) return;
        const act = acts.find(a => a.id === blk.actId);
        if (!act) return;
        const color = act.color || "#555";
        const fillColor = type === "plan" ? lightenHexColor(color, 0.2) : color;
        const blockKey = `${dt}_${blk.actId}_${type}_${blk.startH}_${blk.endH}`;
        const segment = document.createElement("div");
        segment.className = `hs2-cell-segment hs2-cell-segment--${type}`;
        segment.dataset.blockKey = blockKey;
        if (_timetableView !== "both") segment.classList.add("hs2-cell-segment--full");
        segment.style.background = fillColor;
        const timeLabel = formatDurationHours(blk.endH - blk.startH);

        const startsInCell = blk.startH >= h && blk.startH < h + 1;
        const endsInCell = blk.endH > h && blk.endH < h + 1;
        if (startsInCell) segment.style.top = `${Math.max(0, blk.startH - h) * HOUR_H}px`;
        if (endsInCell) segment.style.bottom = `${Math.max(0, h + 1 - blk.endH) * HOUR_H}px`;

        const nextBlk = h < 23 ? blocks.find(b => normalizeBlockType(b.type) === type && b.startH < h + 2 && b.endH > h + 1) : null;
        const nextSame = nextBlk?.actId === blk.actId;
        if (nextSame) segment.style.boxShadow = `0 2px 0 0 ${fillColor}`;

        const blockMid = (blk.startH + blk.endH) / 2;
        const labelInCell = _timetableView === "both"
          ? blockMid >= h && blockMid < h + 1
          : startsInCell;
        const blockHours = Math.max(1 / 60, blk.endH - blk.startH);
        const blockHeight = Math.max(18, blockHours * HOUR_H + Math.max(0, Math.ceil(blockHours) - 1) * GAP);

        if (labelInCell) {
          const content = document.createElement("div");
          content.className = `hs2-time-block-content hs2-time-block-content--cell hs2-time-block-content--${type}`;
          if (_timetableView === "both") content.classList.add("hs2-time-block-content--split");
          content.style.height = (_timetableView === "both" ? HOUR_H : blockHeight) + "px";
          cell.style.zIndex = "2";

          if (_timetableView === "both") {
            const compactLabel = document.createElement("div");
            compactLabel.className = "hs2-time-block-compact-label";
            compactLabel.title = `${getBlockTypeLabel(type)} ${act.name}`;

            const nameText = document.createElement("span");
            nameText.className = "hs2-time-block-compact-name";
            nameText.textContent = act.name;

            compactLabel.appendChild(nameText);
            content.appendChild(compactLabel);
          } else {
            const typeTag = document.createElement("div");
            typeTag.className = "hs2-time-block-type";
            typeTag.textContent = getBlockTypeLabel(type);
            content.appendChild(typeTag);

            const label = document.createElement("div");
            label.className = "hs2-time-block-label hs2-time-block-label--cell";
            label.textContent = act.name;
            label.title = act.name;
            content.appendChild(label);
          }

          const taskCount = Array.isArray(blk.tasks) ? blk.tasks.length : 0;
          if (taskCount > 0 && blockHeight >= 34) {
            const badge = document.createElement("div");
            badge.className = "hs2-block-badge hs2-block-badge--cell";
            badge.textContent = `${taskCount}개`;
            content.appendChild(badge);
          }

          segment.appendChild(content);
        }

        if (startsInCell) {
          const hoverZone = document.createElement("div");
          hoverZone.className = `hs2-block-hover-zone hs2-block-hover-zone--${type}`;
          if (_timetableView !== "both") hoverZone.classList.add("hs2-block-hover-zone--full");
          const canMoveBlock = _timetableView === type && (type === "plan" || type === "actual");
          if (canMoveBlock) hoverZone.classList.add("hs2-block-hover-zone--movable");
          hoverZone.style.top = segment.style.top || "0px";
          hoverZone.style.height = blockHeight + "px";
          hoverZone.dataset.timeLabel = timeLabel;
          hoverZone.dataset.blockKey = blockKey;
          hoverZone.title = timeLabel;
          const setBlockHover = (on) => {
            col.querySelectorAll(".hs2-cell-segment").forEach(item => {
              if (item.dataset.blockKey === blockKey) {
                item.classList.toggle("is-hovered", on);
              }
            });
          };
          hoverZone.addEventListener("pointerenter", () => setBlockHover(true));
          hoverZone.addEventListener("pointerleave", () => setBlockHover(false));
          if (canMoveBlock) {
            hoverZone.addEventListener("pointerdown", e => startBlockMove(e, dt, blk, HOUR_H));
          }
          hoverZone.addEventListener("click", (e) => {
            e.stopPropagation();
            if (hoverZone.dataset.dragged === "true" || hoverZone.dataset.suppressClick === "true") return;
            _openTaskPanel(dt, blk, act);
          });
          hoverZone.addEventListener("contextmenu", (e) => {
            openTimetableContextMenu(e, dt, blk, act);
          });
          cell.appendChild(hoverZone);
        }
        cell.appendChild(segment);
      }

      renderCellSegment(planBlk, "plan");
      renderCellSegment(actualBlk, "actual");

      col.appendChild(cell);
    }

    body.appendChild(col);
  });
}

// ── Activity modal (add / edit) ──
function _openActModal(actId, onDone) {
  const acts = loadActs();
  const existing = actId ? acts.find(a => a.id === actId) : null;

  const modal = document.getElementById("hsActModal");
  const nameInput = document.getElementById("hsActNameInput");
  const colorRow = document.getElementById("hsActColorRow");
  const cancelBtn = document.getElementById("hsActCancelBtn");
  const saveBtn = document.getElementById("hsActSaveBtn");
  const startHSel = document.getElementById("hsActStartH");
  const endHSel = document.getElementById("hsActEndH");
  const durInput = document.getElementById("hsActDuration");
  const repeatSel = document.getElementById("hsActRepeat");
  const repeatGroup = repeatSel?.closest(".hs-act-form-group");
  const customRepeat = document.getElementById("hsActCustomRepeat");
  const repeatUnitSel = document.getElementById("hsActRepeatUnit");
  const repeatEveryInput = document.getElementById("hsActRepeatEvery");
  let formError = document.getElementById("hsActFormError");
  if (!formError) {
    formError = document.createElement("div");
    formError.id = "hsActFormError";
    formError.className = "hs2-modal-error hidden";
    document.querySelector(".hs-act-modal-actions")?.before(formError);
  }

  const setFormError = (message) => {
    formError.textContent = message || "";
    formError.classList.toggle("hidden", !message);
  };
  let typeToggle;

  function closeActSelectMenus(exceptWrap) {
    document.querySelectorAll(".hs-act-select").forEach(wrap => {
      if (wrap === exceptWrap) return;
      wrap.classList.remove("open");
      wrap.querySelector(".hs-act-select__menu")?.classList.add("hidden");
    });
  }

  function setupActCustomSelect(selectEl) {
    if (!selectEl) return;
    let wrap = selectEl.nextElementSibling;
    if (!wrap || !wrap.classList?.contains("hs-act-select")) {
      wrap = document.createElement("div");
      wrap.className = "hs-act-select";
      wrap.innerHTML = `
        <button class="hs-act-select__button" type="button"></button>
        <div class="hs-act-select__menu hidden"></div>
      `;
      selectEl.insertAdjacentElement("afterend", wrap);
    }

    const button = wrap.querySelector(".hs-act-select__button");
    const menu = wrap.querySelector(".hs-act-select__menu");
    const syncButton = () => {
      const selected = selectEl.options[selectEl.selectedIndex];
      button.textContent = selected?.textContent || "";
    };

    menu.innerHTML = "";
    [...selectEl.options].forEach(option => {
      const item = document.createElement("button");
      item.className = "hs-act-select__option";
      item.type = "button";
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.classList.toggle("selected", option.value === selectEl.value);
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        selectEl.value = option.value;
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        closeActSelectMenus();
      });
      menu.appendChild(item);
    });

    button.onclick = (event) => {
      event.stopPropagation();
      const willOpen = menu.classList.contains("hidden");
      closeActSelectMenus(wrap);
      wrap.classList.toggle("open", willOpen);
      menu.classList.toggle("hidden", !willOpen);
      if (willOpen) {
        setTimeout(() => {
          document.addEventListener("pointerdown", () => closeActSelectMenus(), { once: true });
        }, 0);
      }
    };
    menu.addEventListener("pointerdown", event => event.stopPropagation());
    selectEl.addEventListener("change", () => {
      syncButton();
      menu.querySelectorAll(".hs-act-select__option").forEach(item => {
        item.classList.toggle("selected", item.dataset.value === selectEl.value);
      });
    });
    syncButton();
  }

  function _clampDurationValue(value) {
    const start = parseTime24(startHSel.value) ?? 0;
    const raw = parseDurationInput(value);
    const max = Math.max(1 / 60, 24 - start);
    return Math.min(Math.max(Number.isFinite(raw) ? raw : 1, 1 / 60), max);
  }

  function _syncEndFromDuration() {
    if (!endHSel) return;
    if (durInput.value.trim() === "") return;
    const start = parseTime24(startHSel.value);
    if (start === null) return;
    const duration = _clampDurationValue(durInput.value);
    const end = Math.min(start + duration, 24);
    endHSel.value = formatTime24(end);
  }

  function _syncDurationFromEnd() {
    if (!endHSel) return;
    const start = parseTime24(startHSel.value);
    const end = parseTime24(endHSel.value);
    if (start === null || end === null || end <= start) return;
    durInput.value = formatDurationHours(end - start);
  }
  startHSel.onchange = _syncEndFromDuration;
  durInput.oninput = _syncEndFromDuration;
  durInput.onblur = () => {
    if (durInput.value.trim() === "") _syncDurationFromEnd();
    else {
      const parsed = _clampDurationValue(durInput.value);
      durInput.value = formatDurationHours(parsed);
      _syncEndFromDuration();
    }
  };
  if (endHSel) {
    endHSel.onchange = _syncDurationFromEnd;
  };
  function _updateCustomRepeat() {
    const selectedBlockType = typeToggle?.value || existing?.defaultBlockType || "plan";
    const isActual = selectedBlockType === "actual";
    repeatGroup?.classList.toggle("hidden", isActual);
    customRepeat?.classList.toggle("hidden", isActual || repeatSel.value !== "custom");
    if (isActual) repeatSel.value = "none";
  }
  repeatSel.addEventListener("change", _updateCustomRepeat);
  repeatEveryInput?.addEventListener("input", () => {
    repeatEveryInput.value = clampRepeatEvery(repeatEveryInput.value);
  });

  // Remove old delete button if any
  document.getElementById("hsActDelBtn")?.remove();

  // Pre-fill
  let selColor = existing ? existing.color : ACT_COLORS[0];
  const defaultType = existing?.defaultBlockType || "plan";
  nameInput.value = existing ? existing.name : "";
  startHSel.value = formatTime24(existing?.defaultStartH ?? 22);
  durInput.value = formatDurationHours(existing?.defaultDuration ?? 1);
  if (endHSel) {
    const start = parseTime24(startHSel.value) ?? 0;
    const savedEnd = roundTimeHour(existing?.defaultEndH);
    const fallbackEnd = start + _clampDurationValue(durInput.value);
    endHSel.value = formatTime24(Math.min(Math.max(Number.isFinite(savedEnd) ? savedEnd : fallbackEnd, start + 1 / 60), 24));
  }
  repeatSel.value = existing?.defaultRepeat ?? "none";
  repeatUnitSel.value = existing?.defaultRepeatUnit ?? "daily";
  repeatEveryInput.value = existing?.defaultRepeatEvery ?? 1;
  setFormError("");
  _syncDurationFromEnd();
  _updateCustomRepeat();
  setupActCustomSelect(repeatSel);
  setupActCustomSelect(repeatUnitSel);

  document.getElementById("hsActTypeGroup")?.remove();
  const typeGroup = document.createElement("div");
  typeGroup.id = "hsActTypeGroup";
  typeGroup.className = "hs-act-form-group";
  const typeLabel = document.createElement("label");
  typeLabel.className = "hs-act-form-label";
  typeLabel.textContent = "구분";
  typeToggle = createBlockTypeToggle(defaultType, _updateCustomRepeat);
  typeGroup.appendChild(typeLabel);
  typeGroup.appendChild(typeToggle.el);
  colorRow.closest(".hs-act-form-group")?.after(typeGroup);
  _updateCustomRepeat();

  // Color swatches
  colorRow.innerHTML = "";
  ACT_COLORS.forEach((c, index) => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "hs-act-color-swatch" + (c === selColor ? " selected" : "");
    sw.title = `색상 ${index + 1}`;
    sw.setAttribute("aria-label", `색상 ${index + 1}`);
    sw.setAttribute("aria-pressed", String(c === selColor));
    sw.style.background = c;
    sw.addEventListener("click", () => {
      colorRow.querySelectorAll(".hs-act-color-swatch").forEach(s => s.classList.remove("selected"));
      colorRow.querySelectorAll(".hs-act-color-swatch").forEach(s => s.setAttribute("aria-pressed", "false"));
      sw.classList.add("selected");
      sw.setAttribute("aria-pressed", "true");
      selColor = c;
    });
    colorRow.appendChild(sw);
  });

  // Show delete button for existing
  if (existing) {
    const delBtn = document.createElement("button");
    delBtn.id = "hsActDelBtn";
    delBtn.className = "hs-act-del-btn";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      const acts2 = loadActs().filter(a => a.id !== actId);
      saveActs(acts2);
      _hideEl(modal);
      onDone?.();
    });
    document.querySelector(".hs-act-modal-actions").prepend(delBtn);
  }

  _showEl(modal);

  const close = () => _hideEl(modal);
  cancelBtn.onclick = close;

  saveBtn.onclick = () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const emoji = existing?.emoji || "";
    const defaultStartH = parseTime24(startHSel.value);
    if (durInput.value.trim() === "") _syncDurationFromEnd();
    const defaultEndH = parseTime24(endHSel?.value);
    if (!Number.isFinite(defaultStartH) || !Number.isFinite(defaultEndH) || defaultEndH <= defaultStartH) {
      setFormError("시간을 확인해주세요.");
      return;
    }
    const defaultDuration = defaultEndH - defaultStartH;
    const defaultBlockType = typeToggle.value;
    const defaultRepeat = defaultBlockType === "actual" ? "none" : repeatSel.value;
    const defaultRepeatUnit = defaultBlockType === "actual" ? "daily" : repeatUnitSel.value;
    const defaultRepeatEvery = defaultBlockType === "actual" ? 1 : clampRepeatEvery(repeatEveryInput.value);

    if (defaultRepeat !== "none") {
      const today = toDateStr(Date.now());
      const ws = _histWeekStart || getWeekStart(today);
      const dates = buildRepeatDates(ws, defaultRepeat, defaultRepeatUnit, defaultRepeatEvery);
      const conflict = findFirstOverlapForDates(loadTlog(), dates, defaultStartH, defaultEndH, existing ? { ignoreActId: actId, type: defaultBlockType } : { type: defaultBlockType });
      if (conflict) {
        setFormError(getOverlapMessage(conflict.block, conflict.date));
        return;
      }
    }

    let savedActId;
    if (existing) {
      const acts2 = loadActs().map(a => a.id === actId ? { ...a, name, emoji, color: selColor, defaultStartH, defaultDuration, defaultEndH, defaultRepeat, defaultRepeatUnit, defaultRepeatEvery, defaultBlockType } : a);
      saveActs(acts2);
      savedActId = actId;
    } else {
      savedActId = "act_" + Date.now();
      const acts2 = loadActs();
      acts2.push({ id: savedActId, name, emoji, color: selColor, goalH: 0, defaultStartH, defaultDuration, defaultEndH, defaultRepeat, defaultRepeatUnit, defaultRepeatEvery, defaultBlockType });
      saveActs(acts2);
    }

    // Create time blocks if repeat is set
    if (defaultRepeat !== "none") {
      const today = toDateStr(Date.now());
      const ws = _histWeekStart || getWeekStart(today);
      const dates = buildRepeatDates(ws, defaultRepeat, defaultRepeatUnit, defaultRepeatEvery);
      const tlog = loadTlog();
      for (const dt of dates) {
        if (!tlog[dt]) tlog[dt] = [];
        tlog[dt] = tlog[dt].filter(b => !(b.actId === savedActId && normalizeBlockType(b.type) === defaultBlockType && b.startH < defaultEndH && b.endH > defaultStartH));
        tlog[dt].push({ actId: savedActId, startH: defaultStartH, endH: defaultEndH, type: defaultBlockType });
        tlog[dt].sort((a, b) => a.startH - b.startH);
        const merged = [];
        for (const blk of tlog[dt]) {
          const last = merged[merged.length - 1];
          if (last && last.actId === blk.actId && normalizeBlockType(last.type) === normalizeBlockType(blk.type) && last.endH >= blk.startH) { last.endH = Math.max(last.endH, blk.endH); }
          else merged.push({ ...blk });
        }
        tlog[dt] = merged;
      }
      localStorage.setItem(TLOG_KEY, JSON.stringify(tlog));
      setTimetableView(defaultBlockType);
    }

    close();
    onDone?.();
  };
}

// ── Time block modal (add / edit / delete) ──
function _openBlockModal(dateStr, hintH, existingBlock, onDone) {
  // Remove any existing modal
  document.getElementById("hs2BlockModal")?.remove();

  const acts = loadActs();
  if (!acts.length) { alert("먼저 활동을 추가해주세요."); return; }

  const modal = document.createElement("div");
  modal.className = "hs2-block-modal";
  modal.id = "hs2BlockModal";

  const box = document.createElement("div");
  box.className = "hs2-block-modal-box";

  const title = document.createElement("div");
  title.className = "hs2-block-modal-title";
  const d = new Date(dateStr + "T00:00:00");
  const DAYS_KO = ["일","월","화","수","목","금","토"];
  title.textContent = `${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS_KO[d.getDay()]}요일`;
  box.appendChild(title);

  // Activity list
  let selActId = existingBlock ? existingBlock.actId : acts[0].id;
  const actList = document.createElement("div");
  actList.className = "hs2-block-act-list";
  acts.forEach(act => {
    const item = document.createElement("div");
    item.className = "hs2-block-act-item" + (act.id === selActId ? " selected" : "");
    const dot = document.createElement("div");
    dot.className = "hs2-block-act-dot";
    dot.style.background = act.color;
    const name = document.createElement("div");
    name.className = "hs2-block-act-name";
    name.textContent = act.name;
    item.appendChild(dot);
    item.appendChild(name);
    item.addEventListener("click", () => {
      actList.querySelectorAll(".hs2-block-act-item").forEach(el => el.classList.remove("selected"));
      item.classList.add("selected");
      selActId = act.id;
    });
    actList.appendChild(item);
  });
  box.appendChild(actList);

  const blockTypeToggle = createBlockTypeToggle(existingBlock?.type || "plan");
  const typeRow = document.createElement("div");
  typeRow.className = "hs2-block-type-row";
  typeRow.appendChild(blockTypeToggle.el);
  box.appendChild(typeRow);

  // Time range inputs
  const timeRow = document.createElement("div");
  timeRow.className = "hs2-block-time-row";

  const startInput = document.createElement("input");
  startInput.className = "hs2-block-time-input";
  startInput.type = "time";
  startInput.value = existingBlock ? formatTime24(existingBlock.startH) : formatTime24(hintH);

  const sep = document.createElement("span");
  sep.className = "hs2-block-time-sep";
  sep.textContent = "→";

  const endInput = document.createElement("input");
  endInput.className = "hs2-block-time-input";
  endInput.type = "time";
  endInput.value = existingBlock ? formatTime24(existingBlock.endH) : formatTime24(Math.min(hintH + 1, 24));

  timeRow.appendChild(startInput);
  timeRow.appendChild(sep);
  timeRow.appendChild(endInput);
  box.appendChild(timeRow);

  const durationRow = document.createElement("div");
  durationRow.className = "hs2-block-duration-row";
  const durationLabel = document.createElement("label");
  durationLabel.className = "hs2-block-duration-label";
  durationLabel.textContent = "얼마나";
  const durationInput = document.createElement("input");
  durationInput.className = "hs2-block-duration-input";
  durationInput.type = "text";
  durationInput.placeholder = "1시간 30분";
  durationInput.autocomplete = "off";
  durationInput.value = formatDurationHours((existingBlock ? existingBlock.endH - existingBlock.startH : 1));
  durationRow.appendChild(durationLabel);
  durationRow.appendChild(durationInput);
  box.appendChild(durationRow);

  const errorMsg = document.createElement("div");
  errorMsg.className = "hs2-modal-error hs2-modal-error--light hidden";
  box.appendChild(errorMsg);

  const setError = (message) => {
    errorMsg.textContent = message || "";
    errorMsg.classList.toggle("hidden", !message);
  };

  // Actions
  const actions = document.createElement("div");
  actions.className = "hs2-block-modal-actions";

  const normalizeTimeField = (input) => {
    const parsed = parseTimeInput(input.value);
    if (parsed !== null) input.value = formatTimeInput(parsed);
  };
  const syncBlockEndFromDuration = () => {
    if (!durationInput.value.trim()) return;
    const start = parseTime24(startInput.value);
    const duration = parseDurationInput(durationInput.value);
    if (start === null || duration === null) return;
    endInput.value = formatTime24(Math.min(start + duration, 24));
  };
  const syncBlockDurationFromEnd = () => {
    const start = parseTime24(startInput.value);
    const end = parseTime24(endInput.value);
    if (start === null || end === null || end <= start) return;
    durationInput.value = formatDurationHours(end - start);
  };
  startInput.addEventListener("change", syncBlockEndFromDuration);
  endInput.addEventListener("change", syncBlockDurationFromEnd);
  durationInput.addEventListener("input", syncBlockEndFromDuration);
  durationInput.addEventListener("blur", () => {
    const parsed = parseDurationInput(durationInput.value);
    if (parsed !== null) durationInput.value = formatDurationHours(parsed);
    syncBlockEndFromDuration();
  });

  if (existingBlock) {
    const delBtn = document.createElement("button");
    delBtn.className = "hs2-block-del";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      const log = loadTlog();
      log[dateStr] = (log[dateStr] || []).filter(b => !isSameTblock(b, existingBlock));
      saveTlog(log);
      modal.remove();
      onDone?.();
    });
    actions.appendChild(delBtn);
  }

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "hs2-block-cancel";
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", () => modal.remove());
  actions.appendChild(cancelBtn);

  const saveBtn = document.createElement("button");
  saveBtn.className = "hs2-block-save";
  saveBtn.textContent = "저장";
  saveBtn.addEventListener("click", () => {
    const startH = parseTime24(startInput.value);
    const endH = parseTime24(endInput.value);
    if (startH === null || endH === null || endH <= startH) {
      startInput.style.borderColor = "#E64040";
      endInput.style.borderColor = "#E64040";
      setError("시작 시간보다 종료 시간이 늦어야 해요.");
      return;
    }
    const log = loadTlog();
    log[dateStr] = log[dateStr] || [];
    const blockType = blockTypeToggle.value;
    const conflict = findOverlappingBlock(log, dateStr, startH, endH, { ignoreBlock: existingBlock, type: blockType });
    if (conflict) {
      setError(getOverlapMessage(conflict, dateStr));
      return;
    }
    if (existingBlock) {
      const idx = log[dateStr].findIndex(b => isSameTblock(b, existingBlock));
      if (idx >= 0) log[dateStr][idx] = { ...existingBlock, actId: selActId, startH, endH, type: blockType };
    } else {
      log[dateStr].push({ id: makeTblockId(), actId: selActId, startH, endH, type: blockType });
    }
    saveTlog(log);
    setTimetableView(blockType);
    modal.remove();
    onDone?.();
  });
  actions.appendChild(saveBtn);

  box.appendChild(actions);
  modal.appendChild(box);
  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

// ── 주 뷰 ──────────────────────────────────────────────────────────
async function loadHistoryWeek(weekStart, container) {
  container.innerHTML = `<div class="hs-loading">불러오는 중...</div>`;
  const dates = getWeekDates(weekStart);
  const recordsByDate = {};
  dates.forEach(d => { recordsByDate[d] = []; });
  if (canUseCloud()) {
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
  const todayStr = toDateStr(Date.now());
  const DAYS_KO = ["일","월","화","수","목","금","토"];

  // ── 1. 주간 타임라인 (날짜별 가로 바) ──
  const tlSection = document.createElement("div");
  tlSection.className = "hs-tl-section";

  const tlHeader = document.createElement("div");
  tlHeader.className = "hs-tl-header";
  tlHeader.innerHTML = `<span class="hs-section-label">이번 주 타임라인</span>`;
  tlSection.appendChild(tlHeader);

  dates.forEach(dt => {
    const d = new Date(dt + "T00:00:00");
    const isToday = dt === todayStr;
    const dayStart = d.getTime();
    const records = recordsByDate[dt] || [];
    const allCI = records
      .flatMap(r => (r.checkIns || []))
      .filter(c => c.text && c.text !== "(기록 없음)" && c.timeMs);

    const dayRow = document.createElement("div");
    dayRow.className = "hs-week-tl-row" + (isToday ? " is-today" : "");

    const label = document.createElement("div");
    label.className = "hs-week-tl-label";
    label.innerHTML = `<span class="hs-week-tl-dayname">${DAYS_KO[d.getDay()]}</span><span class="hs-week-tl-daynum">${d.getDate()}</span>`;

    const bar = document.createElement("div");
    bar.className = "hs-tl-wrap hs-week-tl-bar";

    allCI.forEach(c => {
      const left = Math.max(0, ((c.timeMs - dayStart) / 86400000 * 100)).toFixed(2);
      const t = c.tags && c.tags[0] ? getTag(c.tags[0]) : null;
      const color = t ? t.color : "rgba(255,255,255,0.45)";
      if (c.durationMs > 0) {
        const width = Math.max((c.durationMs / 86400000 * 100), 0.5).toFixed(2);
        const seg = document.createElement("div");
        seg.className = "hs-tl-seg";
        seg.style.left = left + "%";
        seg.style.width = width + "%";
        seg.style.background = color;
        bar.appendChild(seg);
      } else {
        const marker = document.createElement("div");
        marker.className = "hs-tl-marker";
        marker.style.left = left + "%";
        marker.style.background = color;
        bar.appendChild(marker);
      }
    });

    if (isToday) {
      const nowPct = ((Date.now() - dayStart) / 86400000 * 100).toFixed(2);
      const nm = document.createElement("div");
      nm.className = "hs-tl-now-marker";
      nm.style.left = nowPct + "%";
      bar.appendChild(nm);
    }

    dayRow.appendChild(label);
    dayRow.appendChild(bar);
    tlSection.appendChild(dayRow);
  });

  // 축
  const axisWrap = document.createElement("div");
  axisWrap.className = "hs-week-tl-axis-wrap";
  axisWrap.innerHTML = `<div class="hs-week-tl-axis-spacer"></div><div class="hs-tl-axis"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>`;
  tlSection.appendChild(axisWrap);
  container.appendChild(tlSection);

  // ── 2. 주간 카테고리 합계 카드 ──
  const tagTotals = {};
  dates.forEach(dt => {
    const records = recordsByDate[dt] || [];
    records.flatMap(r => (r.checkIns || [])).filter(c => c.durationMs && c.tags).forEach(c => {
      c.tags.forEach(tid => { tagTotals[tid] = (tagTotals[tid] || 0) + c.durationMs; });
    });
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
  if (canUseCloud()) {
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
  if (canUseCloud()) {
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
  const retroSaveBtn = document.createElement("button");
  retroSaveBtn.className = "hs-retro-save-btn";
  retroSaveBtn.textContent = "저장";

  async function saveRetro() {
    const val = retroTa.value.trim();
    if (!retroRecord?._id) return;
    retroRecord.retro = val;
    await updateRecord(retroRecord._id, { retro: val });
    retroSaveBtn.textContent = "저장됨 ✓";
    retroSaveBtn.disabled = true;
    setTimeout(() => { retroSaveBtn.textContent = "저장"; retroSaveBtn.disabled = false; }, 1800);
  }

  retroTa.addEventListener("input", () => {
    retroSaveBtn.textContent = "저장";
    retroSaveBtn.disabled = false;
  });
  retroSaveBtn.addEventListener("click", saveRetro);
  retroSection.appendChild(retroTa);
  retroSection.appendChild(retroSaveBtn);
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
    if (!targetRecord && canUseCloud()) {
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
  if (focusOverlay && focusOverlay.style.display !== "none") {
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
  _hideEl(document.getElementById("wsIdleState"));
  _showEl(document.getElementById("wsActiveState"));
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
  const _fo = document.getElementById("focusOverlay");
  if (_fo) _fo.style.display = "none";
  // Show idle state in left panel
  _showEl(document.getElementById("wsIdleState"));
  _hideEl(document.getElementById("wsActiveState"));
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

function enterApp(user) {
  currentUser = user;
  restoreState();
  if (els.todayText) els.todayText.textContent = formatDate();
  updateProfileMenu(user);

  document.getElementById("loginScreen")?.classList.remove("is-active");
  const _appMain = document.getElementById("appMain");
  _showEl(_appMain);

  _hideEl(document.getElementById("wsIdleState"));
  _hideEl(document.getElementById("wsActiveState"));
  if (timerId) { clearInterval(timerId); timerId = null; }
  els.sessionBadge.textContent = "";

  updateWelcomeScreen();
  initHomeBackgroundSystem();
  initMemoSystem();
  initEmbedSystem();
  initDoodleSystem();
  setAppView(currentAppView);
  showOnboardingIfNeeded();
}

function init() {
  loadTags();
  if (isLocalHost()) {
    els.localLoginBtn?.classList.remove("hidden");
  }

  // Firebase 인증 상태 감지
  auth.onAuthStateChanged((user) => {
    if (!user) {
      if (localDevMode) return;
      // 로그인 안 됨 → 로그인 화면
      showScreen("login");
      return;
    }

    enterApp(user);
  });

  setInterval(() => {
    if (els.todayText) els.todayText.textContent = formatDate();
    updateWelcomeScreen();
  }, 1000);

  // Google 로그인 버튼
  els.googleLoginBtn?.addEventListener("click", signInWithGoogle);
  els.localLoginBtn?.addEventListener("click", () => {
    localDevMode = true;
    enterApp({ uid: "local-dev", email: "local@dayos.dev", isLocalDev: true });
  });
  els.homeEditToggle?.addEventListener("click", () => setHomeEditMode(!homeEditMode));
  els.onboardingCloseBtn?.addEventListener("click", closeOnboarding);
  els.onboardingOverlay?.addEventListener("click", (event) => {
    if (event.target === els.onboardingOverlay) closeOnboarding();
  });
  els.profileBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = els.profileMenu?.classList.contains("hidden");
    els.profileMenu?.classList.toggle("hidden", !willOpen);
    els.profileBtn?.setAttribute("aria-expanded", String(!!willOpen));
  });
  els.logoutBtn?.addEventListener("click", signOut);
  document.addEventListener("click", (event) => {
    if (!els.profileMenu || els.profileMenu.classList.contains("hidden")) return;
    if (event.target.closest(".profile-menu-wrap")) return;
    els.profileMenu.classList.add("hidden");
    els.profileBtn?.setAttribute("aria-expanded", "false");
  });

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
    overlay.style.display = "flex";
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
    const overlay = document.getElementById("focusOverlay");
    if (overlay) overlay.style.display = "none";
  });
  document.getElementById("focusPauseBtn")?.addEventListener("click", () => {
    if (isPaused) resumeSession(); else pauseSession();
  });
  document.getElementById("focusEndBtn")?.addEventListener("click", endSession);

  els.summaryBackButton?.addEventListener("click", () => {
    _hideEl(document.getElementById("summaryScreen"));
    if (startedAtMs) {
      document.getElementById("workspaceSection")
        ?.scrollIntoView({ behavior: "smooth" });
    }
  });
  els.summarySaveButton?.addEventListener("click", async () => {
    await saveSessionToHistory();
    _hideEl(document.getElementById("summaryScreen"));
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

  // historyBackButton removed from new layout — no-op

  els.appFloatingNav?.addEventListener("click", (event) => {
    const btn = event.target.closest(".app-floating-nav__btn");
    if (!btn) return;
    setAppView(btn.dataset.view);
  });
  document.addEventListener("pointermove", handleFloatingNavPointer);
  els.appFloatingNav?.addEventListener("pointerenter", () => setFloatingNavPeek(true));
  els.appFloatingNav?.addEventListener("pointerleave", () => {
    if (currentAppView === "timetable") setFloatingNavPeek(false);
  });
  els.appFloatingNavHitarea?.addEventListener("pointerenter", () => {
    if (currentAppView === "timetable") setFloatingNavPeek(true);
  });
  els.appFloatingNavHitarea?.addEventListener("pointerleave", () => {
    if (currentAppView === "timetable") setFloatingNavPeek(false, 450);
  });

  initMusicSystemV2();

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
