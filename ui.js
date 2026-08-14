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
    doodleActive = !doodleActive;
    if (doodleActive) {
      canvas.style.pointerEvents = "auto";
      toolbar.classList.remove("hidden");
      btn.classList.add("active");
      document.body.style.userSelect = "none";
    } else {
      canvas.style.pointerEvents = "none";
      toolbar.classList.add("hidden");
      btn.classList.remove("active");
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
      isEraser = false;
      toolbar.querySelectorAll(".doodle-tool-color").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      document.getElementById("doodleEraserBtn")?.classList.remove("active");
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
  document.getElementById("doodleEraserBtn")?.addEventListener("click", function() {
    isEraser = !isEraser;
    this.classList.toggle("active", isEraser);
    if (isEraser) {
      toolbar.querySelectorAll(".doodle-tool-color").forEach(x => x.classList.remove("active"));
    }
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
  const second = String(date.getSeconds()).padStart(2, "0");
  const ampm = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${ampm} ${hour12}:${minute}:${second}`;
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
    // Always show the merged record screen
    renderHistoryScreen();
  } else if (screen === "history") {
    _hideEl(summaryOverlay);
    renderHistoryScreen();
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

// ─── 기록 화면 v2 — 활동 사이드바 + 주간 그리드 ──────────────────

let _histDate = null;
let _histWeekStart = null;

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

function makeTblockId() { return "tb_" + Date.now() + "_" + Math.random().toString(36).slice(2,6); }

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

  // Restore scroll position synchronously (after DOM is created)
  if (_restoreScrollTop) {
    const newScroll = document.querySelector(".hs2-grid-scroll");
    if (newScroll) newScroll.scrollTop = _restoreScrollTop;
  }
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

  // ── TIMER row ──
  const timerBox = document.createElement("div");
  timerBox.className = "hs2-sb-timer";
  timerBox.id = "hs2SbTimerBox";
  _renderSbTimerBox(timerBox);
  sidebar.appendChild(timerBox);

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
  const addBtn = document.createElement("button");
  addBtn.className = "hs2-sb-add-btn";
  addBtn.textContent = "+";
  addBtn.addEventListener("click", () => _openActModal(null, () => renderHistoryScreen(_histDate)));
  actsHeader.appendChild(addBtn);
  sidebar.appendChild(actsHeader);

  // ── ACTIVITY list ──
  _renderActSidebar(sidebar, dates);
}

// ── Sidebar timer widget ──
function _renderSbTimerBox(box) {
  box.innerHTML = "";
  if (startedAtMs) {
    const elapsedEl = document.createElement("div");
    elapsedEl.className = "hs2-sb-timer-elapsed";
    const updateEl = () => {
      const pausedMs = totalPausedMs + (isPaused && pausedAt ? Date.now() - pausedAt : 0);
      elapsedEl.textContent = formatDuration(Date.now() - startedAtMs - pausedMs);
    };
    updateEl();
    if (window._hs2SbTimerId) clearInterval(window._hs2SbTimerId);
    window._hs2SbTimerId = setInterval(updateEl, 1000);
    box.appendChild(elapsedEl);

    const stopBtn = document.createElement("button");
    stopBtn.className = "hs2-sb-timer-stop";
    stopBtn.textContent = "종료";
    stopBtn.addEventListener("click", () => {
      if (window._hs2SbTimerId) { clearInterval(window._hs2SbTimerId); window._hs2SbTimerId = null; }
      endSession();
    });
    box.appendChild(stopBtn);
  } else {
    const startBtn = document.createElement("button");
    startBtn.className = "hs2-sb-timer-start";
    startBtn.textContent = "시작하기 →";
    startBtn.addEventListener("click", () => {
      startSession();
      _renderSbTimerBox(box);
    });
    box.appendChild(startBtn);
  }
}

// ── Activity cards (appended into sidebar, no innerHTML reset) ──
function _renderActSidebar(sidebar, dates) {
  const acts = loadActs();
  const tlog = loadTlog();

  acts.forEach(act => {
    // calculate this week's total hours for this activity
    let totalMs = 0;
    dates.forEach(dt => {
      const blocks = (tlog[dt] || []).filter(b => b.actId === act.id);
      blocks.forEach(b => { totalMs += (b.endH - b.startH) * 3600000; });
    });
    const totalH = Math.round(totalMs / 3600000 * 10) / 10;

    const card = document.createElement("div");
    card.className = "hs2-act-card";
    card.dataset.actId = act.id;
    card.style.position = "relative";
    card.addEventListener("click", (e) => {
      if (e.target.closest(".hs2-act-dots") || e.target.closest(".hs2-act-dots-menu") || e.target.closest(".hs2-act-paint-btn")) return;
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

    // paint mode toggle button
    const paintBtn = document.createElement("button");
    paintBtn.className = "hs2-act-paint-btn";
    paintBtn.title = "드래그로 칠하기";
    paintBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M 21.7573 2.5747 c -1.0533 -1.052 -2.888 -1.0533 -3.9427 0 l -6.86 6.86 c 0.8973 0.3333 1.7253 0.8413 2.4227 1.5413 0.7 0.7027 1.196 1.5267 1.52 2.4027 l 6.8613 -6.8613 c 1.0867 -1.0867 1.0867 -2.856 0 -3.944 Z" fill="currentColor"></path><path d="M 11.96 12.388 c -0.892 -0.8947 -2.072 -1.388 -3.3253 -1.388 h -0.008 c -1.248 0.0027 -2.4227 0.496 -3.3067 1.3907 -1.2693 1.2827 -1.492 2.5773 -1.6693 3.616 -0.1987 1.1587 -0.3293 1.9227 -1.796 2.724 -0.3547 0.1933 -0.5573 0.58 -0.516 0.9813 0.0427 0.4013 0.3213 0.7387 0.7067 0.8547 1.4107 0.424 2.9133 0.7733 4.408 0.7733 1.9173 0 3.8227 -0.5733 5.5067 -2.2987 1.828 -1.8333 1.828 -4.8187 0 -6.652 Z" fill="currentColor"></path></svg>`;
    paintBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      _setPaintAct(act.id);
    });
    // right-side action group (paint + dots aligned together)
    const rightGroup = document.createElement("div");
    rightGroup.className = "hs2-act-right";
    rightGroup.appendChild(paintBtn);

    // three-dot menu
    const dots = document.createElement("button");
    dots.className = "hs2-act-dots";
    dots.textContent = "⋯";
    dots.addEventListener("click", (e) => {
      e.stopPropagation();
      // close any existing menu
      document.querySelectorAll(".hs2-act-dots-menu").forEach(m => m.remove());
      const menu = document.createElement("div");
      menu.className = "hs2-act-dots-menu";
      const editBtn = document.createElement("button");
      editBtn.className = "hs2-act-dots-item";
      editBtn.textContent = "수정";
      editBtn.addEventListener("click", () => {
        menu.remove();
        _openActModal(act.id, () => renderHistoryScreen(_histDate));
      });
      const delBtn = document.createElement("button");
      delBtn.className = "hs2-act-dots-item hs2-act-dots-item--del";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", () => {
        menu.remove();
        const acts2 = loadActs().filter(a => a.id !== act.id);
        saveActs(acts2);
        renderHistoryScreen(_histDate);
      });
      menu.appendChild(editBtn);
      menu.appendChild(delBtn);
      rightGroup.appendChild(menu);
      setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
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
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "hs2-abm-input";
  dateInput.value = _histDate || toDateStr(Date.now());
  fields.appendChild(_row("날짜", dateInput));

  // Start time
  const startSel = document.createElement("select");
  startSel.className = "hs2-abm-input";
  // End time
  const endSel = document.createElement("select");
  endSel.className = "hs2-abm-input";
  for (let h = 0; h < 24; h++) {
    const ap = h < 12 ? "오전" : "오후";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const label = `${ap} ${h12}:00`;
    const os = document.createElement("option"); os.value = h; os.textContent = label;
    const oe = document.createElement("option"); oe.value = h; oe.textContent = label;
    startSel.appendChild(os);
    endSel.appendChild(oe);
  }
  startSel.value = 22;
  endSel.value = 23;
  startSel.addEventListener("change", () => {
    if (parseInt(endSel.value) <= parseInt(startSel.value)) {
      endSel.value = Math.min(parseInt(startSel.value) + 1, 23);
    }
  });
  fields.appendChild(_row("시작", startSel));
  fields.appendChild(_row("종료", endSel));

  // Repeat
  const repeatSel = document.createElement("select");
  repeatSel.className = "hs2-abm-input";
  [["none","반복 없음"], ["daily","매일 (이번 주)"], ["weekly","매주 (4주)"]].forEach(([v, t]) => {
    const o = document.createElement("option"); o.value = v; o.textContent = t;
    repeatSel.appendChild(o);
  });
  fields.appendChild(_row("반복", repeatSel));

  modal.appendChild(fields);

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
    const s = parseInt(startSel.value);
    const en = Math.max(parseInt(endSel.value), s + 1);
    const repeat = repeatSel.value;
    if (!date) return;

    // Build list of dates
    let dates = [date];
    if (repeat === "daily") {
      // all 7 days of current week
      const ws = new Date(_histWeekStart + "T00:00:00");
      dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws); d.setDate(d.getDate() + i);
        dates.push(toDateStr(d.getTime()));
      }
    } else if (repeat === "weekly") {
      const base = new Date(date + "T00:00:00");
      dates = [];
      for (let w = 0; w < 4; w++) {
        const d = new Date(base); d.setDate(d.getDate() + w * 7);
        dates.push(toDateStr(d.getTime()));
      }
    }

    const tlog = loadTlog();
    for (const dt of dates) {
      if (!tlog[dt]) tlog[dt] = [];
      tlog[dt] = tlog[dt].filter(b => !(b.actId === act.id && b.startH < en && b.endH > s));
      tlog[dt].push({ actId: act.id, startH: s, endH: en });
      // merge adjacent
      tlog[dt].sort((a, b) => a.startH - b.startH);
      const merged = [];
      for (const blk of tlog[dt]) {
        const last = merged[merged.length - 1];
        if (last && last.actId === blk.actId && last.endH >= blk.startH) {
          last.endH = Math.max(last.endH, blk.endH);
        } else { merged.push({ ...blk }); }
      }
      tlog[dt] = merged;
    }
    localStorage.setItem(TLOG_KEY, JSON.stringify(tlog));
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
  title.textContent = act.name;
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
  function _fmtH(h) {
    if (h === 0) return "오전 12:00";
    if (h === 12) return "오후 12:00";
    const ap = h < 12 ? "오전" : "오후";
    return `${ap} ${h > 12 ? h - 12 : h}:00`;
  }
  const dur = block.endH - block.startH;
  const durStr = dur >= 1 ? `${dur}시간` : `${dur * 60}분`;
  const meta = document.createElement("div");
  meta.className = "hs2-tp-meta";
  const metaDate = document.createElement("div");
  metaDate.className = "hs2-tp-meta-date";
  metaDate.textContent = dateStr;
  const metaTime = document.createElement("div");
  metaTime.className = "hs2-tp-meta-time";
  metaTime.textContent = `${_fmtH(block.startH)} – ${_fmtH(block.endH)} · ${durStr}`;
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
    const idx = blocks.findIndex(b => b.startH === block.startH && b.actId === block.actId);
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
      tlog[date] = tlog[date].filter(b => !(b.startH === block.startH && b.actId === block.actId));
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

// ── Paint mode state ──
let _paintActId = null;   // currently selected activity for painting

function _setPaintAct(actId) {
  _paintActId = (actId !== null && _paintActId === actId) ? null : actId;
  // update sidebar card highlight
  document.querySelectorAll(".hs2-act-card").forEach(el => {
    el.classList.toggle("hs2-act-card--active", el.dataset.actId === _paintActId);
  });
  // update grid cursor
  const body = document.querySelector(".hs2-grid-body");
  if (body) body.classList.toggle("hs2-paint-cursor", !!_paintActId);
  // lock/unlock scroll on the grid while paint mode is active
  const gridScroll = document.querySelector(".hs2-grid-scroll");
  if (gridScroll) {
    if (_paintActId) {
      gridScroll.style.overflowY = "hidden";
      gridScroll.style.touchAction = "none";
    } else {
      gridScroll.style.overflowY = "";
      gridScroll.style.touchAction = "";
    }
  }
  // update paint banner
  const banner = document.querySelector(".hs2-paint-banner");
  if (banner) {
    if (_paintActId) {
      const act = loadActs().find(a => a.id === _paintActId);
      banner.querySelector(".hs2-paint-banner-dot").style.background = act?.color || "#555";
      banner.querySelector(".hs2-paint-banner-text").textContent = `${act?.name || ""} 칠하는 중`;
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }
}
// ESC to cancel paint mode
document.addEventListener("keydown", e => { if (e.key === "Escape" && _paintActId) _setPaintAct(null); });

// ── Week grid ──
function _renderWeekGrid(gridPanel, dates) {
  const todayStr = toDateStr(Date.now());
  const DAYS_EN = ["MON","TUE","WED","THU","FRI","SAT","SUN"];

  // Topbar (week nav)
  const topbar = document.createElement("div");
  topbar.className = "hs2-grid-topbar";

  const wsD = new Date(_histWeekStart + "T00:00:00");
  const weD = new Date(_histWeekStart + "T00:00:00"); weD.setDate(weD.getDate() + 6);
  const sameMonth = wsD.getMonth() === weD.getMonth();
  const label = document.createElement("span");
  label.className = "hs2-grid-date-label";
  label.textContent = sameMonth
    ? `${wsD.getMonth()+1}월 ${wsD.getDate()}일 — ${weD.getDate()}일`
    : `${wsD.getMonth()+1}/${wsD.getDate()} — ${weD.getMonth()+1}/${weD.getDate()}`;
  topbar.appendChild(label);

  const todayBtn = document.createElement("button");
  todayBtn.className = "hs2-grid-nav-btn";
  todayBtn.textContent = "오늘";
  todayBtn.addEventListener("click", () => {
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

  topbar.appendChild(prevBtn);
  topbar.appendChild(todayBtn);
  topbar.appendChild(nextBtn);
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

  // Paint mode banner
  const paintBanner = document.createElement("div");
  paintBanner.className = "hs2-paint-banner";
  paintBanner.style.display = "none";
  const bannerDot = document.createElement("div");
  bannerDot.className = "hs2-paint-banner-dot";
  const bannerText = document.createElement("span");
  bannerText.className = "hs2-paint-banner-text";
  const bannerEsc = document.createElement("span");
  bannerEsc.className = "hs2-paint-banner-esc";
  bannerEsc.textContent = "ESC";
  bannerEsc.addEventListener("click", () => _setPaintAct(null));
  paintBanner.appendChild(bannerDot);
  paintBanner.appendChild(bannerText);
  paintBanner.appendChild(bannerEsc);
  gridPanel.appendChild(paintBanner);

  // Scrollable grid
  const scroll = document.createElement("div");
  scroll.className = "hs2-grid-scroll";
  gridPanel.appendChild(scroll);

  const body = document.createElement("div");
  body.className = "hs2-grid-body";
  scroll.appendChild(body);

  // ── Drag-paint logic (coordinate-based) ──
  const HOUR_H = 44;
  const TIME_COL_W = 44;
  let _painting = false;
  let _paintStartH = null;
  let _paintEndH = null;
  let _paintDate = null;
  let _paintPreview = null;
  let _paintColIdx = null;

  function _coordToInfo(e) {
    const rect = scroll.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scroll.scrollTop;
    if (x < TIME_COL_W || y < 0) return null;
    const colW = (rect.width - TIME_COL_W) / 7;
    const colIdx = Math.floor((x - TIME_COL_W) / colW);
    if (colIdx < 0 || colIdx > 6) return null;
    const hour = Math.floor(y / HOUR_H);
    if (hour < 0 || hour > 23) return null;
    return { colIdx, date: dates[colIdx], hour };
  }

  function _updatePreview() {
    if (_paintPreview) { _paintPreview.remove(); _paintPreview = null; }
    if (!_painting || _paintDate === null) return;
    const actsList = loadActs();
    const act = actsList.find(a => a.id === _paintActId);
    if (!act) return;
    const col = body.querySelectorAll(".hs2-grid-day-col")[_paintColIdx];
    if (!col) return;
    const s = Math.min(_paintStartH, _paintEndH);
    const e2 = Math.max(_paintStartH, _paintEndH) + 1;
    _paintPreview = document.createElement("div");
    _paintPreview.className = "hs2-time-block hs2-time-block--preview";
    _paintPreview.style.background = act.color || "#555";
    _paintPreview.style.top = (s * HOUR_H) + "px";
    _paintPreview.style.height = Math.max((e2 - s) * HOUR_H - 2, 20) + "px";
    _paintPreview.style.opacity = "0.55";
    col.appendChild(_paintPreview);
  }

  scroll.addEventListener("pointerdown", e => {
    if (!_paintActId) return;
    const info = _coordToInfo(e);
    if (!info) return;
    e.preventDefault();
    _painting = true;
    _paintDate = info.date;
    _paintColIdx = info.colIdx;
    _paintStartH = info.hour;
    _paintEndH = info.hour;
    scroll.setPointerCapture(e.pointerId);
    scroll.style.overflowY = "hidden"; // lock scroll while painting
    _updatePreview();
  }, { passive: false });

  scroll.addEventListener("pointermove", e => {
    if (!_painting) return;
    e.preventDefault(); // prevent scroll while painting
    const info = _coordToInfo(e);
    if (!info || info.colIdx !== _paintColIdx) return;
    _paintEndH = info.hour;
    _updatePreview();
  }, { passive: false });

  scroll.addEventListener("pointerup", e => {
    if (!_painting) return;
    _painting = false;
    const savedScrollTop = scroll.scrollTop; // save current position before re-render
    if (_paintPreview) { _paintPreview.remove(); _paintPreview = null; }
    if (_paintDate && _paintActId && _paintStartH !== null && _paintEndH !== null) {
      const s = Math.min(_paintStartH, _paintEndH);
      const en = Math.max(_paintStartH, _paintEndH) + 1;
      const tlog = loadTlog();
      if (!tlog[_paintDate]) tlog[_paintDate] = [];
      // Remove overlapping same-act blocks, then add new block
      tlog[_paintDate] = tlog[_paintDate].filter(b => !(b.actId === _paintActId && b.startH < en && b.endH > s));
      tlog[_paintDate].push({ actId: _paintActId, startH: s, endH: en });
      // Merge adjacent/touching same-act blocks into one continuous block
      tlog[_paintDate].sort((a, b) => a.startH - b.startH);
      const merged = [];
      for (const blk of tlog[_paintDate]) {
        const last = merged[merged.length - 1];
        if (last && last.actId === blk.actId && last.endH >= blk.startH) {
          last.endH = Math.max(last.endH, blk.endH);
          if (blk.tasks) last.tasks = [...(last.tasks || []), ...blk.tasks];
        } else {
          merged.push({ ...blk });
        }
      }
      tlog[_paintDate] = merged;
      localStorage.setItem(TLOG_KEY, JSON.stringify(tlog));
      renderHistoryScreen(_histDate, savedScrollTop); // pass saved scroll to prevent jump
    }
    _paintDate = null; _paintStartH = null; _paintEndH = null; _paintColIdx = null;
  });

  // Block wheel scroll while in paint mode (prevents trackpad scroll during painting)
  scroll.addEventListener("wheel", e => {
    if (_paintActId) e.preventDefault();
  }, { passive: false });

  const tlog = loadTlog();
  const acts = loadActs();

  // Time labels column
  const timeCol = document.createElement("div");
  timeCol.className = "hs2-grid-time-col";
  for (let h = 0; h < 24; h++) {
    const lbl = document.createElement("div");
    lbl.className = "hs2-grid-hour-label";
    lbl.textContent = h === 0 ? "" : `${h}:00`;
    timeCol.appendChild(lbl);
  }
  body.appendChild(timeCol);

  // Day columns
  dates.forEach((dt, di) => {
    const col = document.createElement("div");
    col.className = "hs2-grid-day-col";
    col.dataset.date = dt;

    // Hour cells (paint mode)
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement("div");
      cell.className = "hs2-grid-hour-cell";
      cell.dataset.date = dt;
      cell.dataset.hour = h;
      col.appendChild(cell);
    }

    // Render existing time blocks for this day
    const blocks = tlog[dt] || [];
    blocks.forEach(block => {
      const act = acts.find(a => a.id === block.actId);
      if (!act) return;
      const tb = document.createElement("div");
      tb.className = "hs2-time-block";
      tb.style.background = act.color || "#555";
      tb.style.top = (block.startH * 44) + "px";
      tb.style.height = Math.max((block.endH - block.startH) * 44 - 2, 20) + "px";
      // name
      const lbl = document.createElement("div");
      lbl.className = "hs2-time-block-label";
      lbl.textContent = act.name;
      tb.appendChild(lbl);
      // task count badge
      if (block.tasks && block.tasks.length > 0) {
        const done = block.tasks.filter(t => t.done).length;
        const badge = document.createElement("div");
        badge.className = "hs2-block-badge";
        badge.textContent = `${done}/${block.tasks.length}`;
        tb.appendChild(badge);
      }
      tb.addEventListener("click", (e) => {
        if (_paintActId) return; // paint mode: ignore click on existing blocks
        e.stopPropagation();
        _openTaskPanel(dt, block, act);
      });
      col.appendChild(tb);
    });

    body.appendChild(col);
  });

  // Scroll to 7am
  setTimeout(() => { scroll.scrollTop = 7 * 44; }, 0);
}

// ── Activity modal (add / edit) ──
function _openActModal(actId, onDone) {
  const acts = loadActs();
  const existing = actId ? acts.find(a => a.id === actId) : null;

  const modal = document.getElementById("hsActModal");
  const emojiEl = document.getElementById("hsActModalEmoji");
  const nameInput = document.getElementById("hsActNameInput");
  const goalInput = document.getElementById("hsActGoalInput");
  const emojiInput = document.getElementById("hsActEmojiInput");
  const colorRow = document.getElementById("hsActColorRow");
  const cancelBtn = document.getElementById("hsActCancelBtn");
  const saveBtn = document.getElementById("hsActSaveBtn");
  const startHSel = document.getElementById("hsActStartH");
  const durInput = document.getElementById("hsActDuration");
  const endDisplay = document.getElementById("hsActEndDisplay");
  const repeatSel = document.getElementById("hsActRepeat");

  // Populate start time select (only once)
  if (!startHSel.options.length) {
    for (let h = 0; h < 24; h++) {
      const ap = h < 12 ? "오전" : "오후";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      startHSel.appendChild(Object.assign(document.createElement("option"), { value: h, textContent: `${ap} ${h12}:00` }));
    }
  }

  function _fmtHour(h) {
    const hh = ((h % 24) + 24) % 24;
    const ap = hh < 12 ? "오전" : "오후";
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return `${ap} ${h12}:00`;
  }
  function _updateEndDisplay() {
    const s = parseInt(startHSel.value) || 0;
    const dur = parseFloat(durInput.value) || 0;
    if (dur > 0) {
      endDisplay.textContent = _fmtHour(s + dur);
      endDisplay.style.color = "";
    } else {
      endDisplay.textContent = "—";
      endDisplay.style.color = "var(--text-muted, rgba(0,0,0,0.25))";
    }
  }
  startHSel.addEventListener("change", _updateEndDisplay);
  durInput.addEventListener("input", _updateEndDisplay);

  // Remove old delete button if any
  document.getElementById("hsActDelBtn")?.remove();

  // Pre-fill
  let selColor = existing ? existing.color : ACT_COLORS[0];
  nameInput.value = existing ? existing.name : "";
  goalInput.value = existing && existing.goalH ? String(existing.goalH) : "";
  emojiInput.value = existing ? existing.emoji : "";
  emojiEl.textContent = existing ? existing.emoji : "✏️";
  startHSel.value = existing?.defaultStartH ?? 22;
  durInput.value = existing?.defaultDuration ?? "";
  repeatSel.value = existing?.defaultRepeat ?? "none";
  _updateEndDisplay();

  // Color swatches
  colorRow.innerHTML = "";
  ACT_COLORS.forEach(c => {
    const sw = document.createElement("div");
    sw.className = "hs-act-color-swatch" + (c === selColor ? " selected" : "");
    sw.style.background = c;
    sw.addEventListener("click", () => {
      colorRow.querySelectorAll(".hs-act-color-swatch").forEach(s => s.classList.remove("selected"));
      sw.classList.add("selected");
      selColor = c;
    });
    colorRow.appendChild(sw);
  });

  // Emoji input → update preview
  emojiInput.addEventListener("input", () => {
    const v = emojiInput.value.trim();
    emojiEl.textContent = v || "✏️";
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
    const emoji = emojiInput.value.trim() || "📌";
    const goalH = parseFloat(goalInput.value) || 0;
    const defaultStartH = parseInt(startHSel.value);
    const defaultDuration = Math.max(parseFloat(durInput.value) || 1, 0.5);
    const defaultEndH = Math.round((defaultStartH + defaultDuration) * 2) / 2; // keep 0.5h precision
    const defaultRepeat = repeatSel.value;

    let savedActId;
    if (existing) {
      const acts2 = loadActs().map(a => a.id === actId ? { ...a, name, emoji, color: selColor, goalH, defaultStartH, defaultDuration, defaultEndH, defaultRepeat } : a);
      saveActs(acts2);
      savedActId = actId;
    } else {
      savedActId = "act_" + Date.now();
      const acts2 = loadActs();
      acts2.push({ id: savedActId, name, emoji, color: selColor, goalH, defaultStartH, defaultDuration, defaultEndH, defaultRepeat });
      saveActs(acts2);
    }

    // Create time blocks if repeat is set
    if (defaultRepeat !== "none") {
      const today = toDateStr(Date.now());
      const ws = _histWeekStart || getWeekStart(today);
      let dates = [];
      if (defaultRepeat === "daily") {
        const wsD = new Date(ws + "T00:00:00");
        for (let i = 0; i < 7; i++) {
          const d = new Date(wsD); d.setDate(d.getDate() + i);
          dates.push(toDateStr(d.getTime()));
        }
      } else if (defaultRepeat === "weekly") {
        const baseD = new Date(ws + "T00:00:00");
        for (let w = 0; w < 4; w++) {
          const d = new Date(baseD); d.setDate(d.getDate() + w * 7);
          dates.push(toDateStr(d.getTime()));
        }
      }
      const tlog = loadTlog();
      for (const dt of dates) {
        if (!tlog[dt]) tlog[dt] = [];
        tlog[dt] = tlog[dt].filter(b => !(b.actId === savedActId && b.startH < defaultEndH && b.endH > defaultStartH));
        tlog[dt].push({ actId: savedActId, startH: defaultStartH, endH: defaultEndH });
        tlog[dt].sort((a, b) => a.startH - b.startH);
        const merged = [];
        for (const blk of tlog[dt]) {
          const last = merged[merged.length - 1];
          if (last && last.actId === blk.actId && last.endH >= blk.startH) { last.endH = Math.max(last.endH, blk.endH); }
          else merged.push({ ...blk });
        }
        tlog[dt] = merged;
      }
      localStorage.setItem(TLOG_KEY, JSON.stringify(tlog));
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
    name.textContent = `${act.emoji} ${act.name}`;
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

  // Time range inputs
  const timeRow = document.createElement("div");
  timeRow.className = "hs2-block-time-row";

  const fmt = h => `${String(h).padStart(2,"0")}:00`;
  const startInput = document.createElement("input");
  startInput.className = "hs2-block-time-input";
  startInput.type = "text";
  startInput.value = existingBlock ? fmt(existingBlock.startH) : fmt(hintH);
  startInput.placeholder = "시작";

  const sep = document.createElement("span");
  sep.className = "hs2-block-time-sep";
  sep.textContent = "→";

  const endInput = document.createElement("input");
  endInput.className = "hs2-block-time-input";
  endInput.type = "text";
  endInput.value = existingBlock ? fmt(existingBlock.endH) : fmt(Math.min(hintH + 1, 24));
  endInput.placeholder = "종료";

  timeRow.appendChild(startInput);
  timeRow.appendChild(sep);
  timeRow.appendChild(endInput);
  box.appendChild(timeRow);

  // Actions
  const actions = document.createElement("div");
  actions.className = "hs2-block-modal-actions";

  const parseHr = str => {
    str = str.trim().replace(/[시:h]/g, "").replace(/\s/g,"");
    const n = parseFloat(str);
    return isNaN(n) ? null : Math.min(Math.max(Math.round(n * 2) / 2, 0), 24);
  };

  if (existingBlock) {
    const delBtn = document.createElement("button");
    delBtn.className = "hs2-block-del";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      const log = loadTlog();
      log[dateStr] = (log[dateStr] || []).filter(b => b.id !== existingBlock.id);
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
    const startH = parseHr(startInput.value);
    const endH = parseHr(endInput.value);
    if (startH === null || endH === null || endH <= startH) {
      startInput.style.borderColor = "#E64040";
      endInput.style.borderColor = "#E64040";
      return;
    }
    const log = loadTlog();
    log[dateStr] = log[dateStr] || [];
    if (existingBlock) {
      const idx = log[dateStr].findIndex(b => b.id === existingBlock.id);
      if (idx >= 0) log[dateStr][idx] = { ...existingBlock, actId: selActId, startH, endH };
    } else {
      log[dateStr].push({ id: makeTblockId(), actId: selActId, startH, endH });
    }
    saveTlog(log);
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
    const _appMain = document.getElementById("appMain");
    if (_appMain) _appMain.style.display = "";

    if (startedAtMs) {
      _hideEl(document.getElementById("wsIdleState"));
      _showEl(document.getElementById("wsActiveState"));
      els.sessionBadge.textContent = "작업 기록 중";
      updateFocusScreen();
      timerId = setInterval(updateFocusScreen, 1000);
    } else {
      _showEl(document.getElementById("wsIdleState"));
      _hideEl(document.getElementById("wsActiveState"));
      els.sessionBadge.textContent = "대기";
    }

    updateWelcomeScreen();
    initMemoSystem();
    initEmbedSystem();
    initDoodleSystem();
    // 우측 패널에 기록 자동 로드
    renderHistoryScreen();
  });

  setInterval(() => {
    if (els.todayText) els.todayText.textContent = formatDate();
    updateWelcomeScreen();
  }, 1000);

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

  els.historyLinkButton?.addEventListener("click", () => {
    if (startedAtMs) {
      document.getElementById("workspaceSection")
        ?.scrollIntoView({ behavior: "smooth" });
    } else {
      startSession();
    }
  });

  // historyBackButton removed from new layout — no-op

  // 기록 화면 열기 버튼 (헤더)
  document.getElementById("recordNavBtn")?.addEventListener("click", () => {
    renderHistoryScreen();
  });

  // 새벽: 배경 영상 교체
  const hour = new Date().getHours();
  const isDawn = hour >= 0 && hour < 6;
  if (isDawn) {
    document.querySelectorAll(".welcome-bg-video").forEach(v => {
      v.src = "./dawn-drive.mp4"; v.load(); v.play().catch(() => {});
    });
  }

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
