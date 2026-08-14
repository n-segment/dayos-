# DayOS — Worklog (Codex 인수인계)

## 프로젝트 기본 정보

- **URL**: https://n-segment.github.io/dayos-/
- **스택**: 순수 HTML/CSS/JS + Firebase Auth + Firestore
- **배포**: GitHub Pages (자동 배포)
- **파일 구조**:
  - `index.html` — 앱 진입점, CSS/JS 버전 관리
  - `ui.js` — 전체 앱 로직
  - `ui.css` — 전체 스타일

## 캐시 버스팅 규칙

`index.html`에서 CSS/JS를 버전 쿼리스트링으로 로드:
```html
<link rel="stylesheet" href="./ui.css?v=128" />
<script src="./ui.js?v=128"></script>
```
**코드 수정 후 반드시 버전 올려야 브라우저에 반영됨.** CSS만 바꾸면 CSS 버전만, JS 바꾸면 JS 버전만 올려도 됨. 둘 다 바꾸면 둘 다 올릴 것.

## 현재 버전

- `ui.css?v=136`
- `ui.js?v=136`

---

## 주간 그리드 (핵심 화면) 구조

### 레이아웃 (renderHistoryScreen)

```
.hs2-layout
  ├── .hs2-sidebar          (좌: 활동 목록, 타이머)
  └── .hs2-grid-panel       (우: 주간 캘린더 그리드)
       ├── .hs2-grid-topbar  (날짜 레이블 + 네비게이션 + 연필 아이콘)
       ├── .hs2-grid-day-headers  (요일 헤더 행)
       └── .hs2-grid-scroll
            └── .hs2-grid-body   (CSS grid: 44px + repeat(7, 1fr))
                 ├── .hs2-grid-time-col  (시간 레이블 컬럼)
                 └── .hs2-grid-day-col × 7  (각 요일)
                      └── .hs2-grid-hour-cell × 24  (각 시간 칸)
```

### 핵심 변수

```js
const GAP = 1;  // 시간 행 사이 1px 간격
const HOUR_H = Math.max(Math.floor((availableH - 23 * GAP) / 24), 20);
// → 화면에 24시간이 스크롤 없이 딱 맞게 들어가도록 계산
// → _cachedHourH 모듈 변수에 저장 (페인트 오버레이에서 재사용)
```

### 시간 레이블

- 높이: `(HOUR_H + 1)px` — 1px gap까지 커버해서 라인 없이 이어짐
- 정렬: `align-items: center; padding: 0` — 칸 정중앙
- "0시"는 "24"로 표시

### 시간 칸 렌더링 (최근 리팩터링)

**이전 방식 (절대 위치 막대)**: `.hs2-time-block` div를 절대 위치로 올림  
**현재 방식 (셀 직접 색칠)**: paint mode와 동일하게 각 시간 칸에 직접 색상 적용

```js
// _renderWeekGrid 내 day column 생성 로직
for (let h = 0; h < 24; h++) {
  const cell = document.createElement("div");
  cell.className = "hs2-grid-hour-cell";
  cell.style.height = HOUR_H + "px";

  const blk = blocks.find(b => b.startH <= h && b.endH > h);
  if (blk) {
    const act = acts.find(a => a.id === blk.actId);
    if (!act) { col.appendChild(cell); continue; }  // 삭제된 활동 무시
    const color = act.color || "#555";
    cell.style.background = color;

    // 앞뒤 같은 활동이면 모서리 처리
    const prevSame = /* h-1도 같은 act? */;
    const nextSame = /* h+1도 같은 act? */;
    // borderRadius: prevSame && nextSame → "0", prevSame → "0 0 4px 4px", nextSame → "4px 4px 0 0", else → "4px"

    // 연속 셀 사이 1px gap을 같은 색으로 채워서 하나의 블록처럼 보이게
    if (nextSame) cell.style.boxShadow = `0 2px 0 0 ${color}`;

    cell.addEventListener("click", e => { e.stopPropagation(); _openTaskPanel(dt, blk, act); });
  }
  col.appendChild(cell);
}
```

**핵심 원리**: `gap: 1px`인 flex 컬럼에서 셀 아래로 `boxShadow: 0 2px 0 0 color`를 사용해 1px 갭을 같은 색으로 채움 → 연속 칸이 하나의 연속 블록처럼 보임

---

## 페인트 모드 (블록 채우기) 구조

`_openPaintOverlay()` 함수가 그리드 패널 위에 오버레이로 표시됨.

```
.hs2-pedit-topbar   (활동 팔레트 + 완료 버튼)
.hs2-pedit-body     (height = HOUR_H * 24 + 23px, 고정)
  ├── .hs2-pedit-time-col  (flex column, gap:1px, bg:#1c1c1c — gap 색 = bg = 안보임)
  │    └── .hs2-pedit-time-lbl × 24  (height: HOUR_H+1px, align-items:center)
  └── .hs2-pedit-grid  (CSS grid: repeat(7, 1fr), gridTemplateRows: repeat(24, HOUR_H px))
       └── .hs2-pedit-cell × 168  (7×24)
```

**페인트 모드에서 시간 컬럼이 CSS grid 밖에 별도로 있는 이유**: grid 안에 있으면 gap:1px 적용 시 시간 레이블 사이에 흰 줄이 생김. 별도 flex 컬럼으로 분리 후 bg:#1c1c1c = gap 색과 동일 → 줄 안보임.

---

## 사이드바 구조

```
.hs2-sidebar
  ├── 날짜/시계
  ├── 시작하기 버튼
  ├── [스페이서]
  ├── .hs2-sb-acts-header  ("활동" 레이블만 있음)
  ├── .hs2-act-card × N   (각 활동)
  └── .hs2-act-add-row    ("+ 활동 추가" inline 버튼)
```

**최근 변경**: 기존에 `actsHeader`에 있던 "블록 채우기"/"활동 추가" 버튼을 제거하고:
- "블록 채우기" → 그리드 topbar 우측 연필 아이콘 버튼 (`.hs2-grid-edit-btn`)
- "활동 추가" → 활동 목록 하단 inline row (`.hs2-act-add-row`)

---

## 다크 모드 CSS 핵심

`#historyScreen .xxx {}` 셀렉터로 다크 테마 오버라이드.

```css
/* 그리드 gap 색 (행 구분선) */
#historyScreen .hs2-grid-body {
  background: rgba(255,255,255,0.07) !important;
  gap: 1px !important;
}

/* 요일 컬럼 flex */
#historyScreen .hs2-grid-day-col {
  display: flex !important;
  flex-direction: column !important;
  gap: 1px !important;
  border-left: none !important;
}

/* 시간 칸 기본 배경 — !important 제거되어 inline style이 우선됨 */
#historyScreen .hs2-grid-hour-cell {
  background: rgba(255,255,255,0.04);
  border-top: none !important;
}

/* 시간 레이블 */
#historyScreen .hs2-grid-hour-label {
  color: rgba(255,255,255,0.4);
  font-size: 9px;
  box-sizing: border-box;
  border-top: none;
  align-items: center;
  padding: 0;
}

/* 시간 컬럼 배경 */
#historyScreen .hs2-grid-time-col {
  background: #1c1c1c;
  gap: 0;
  display: flex;
  flex-direction: column;
}
```

**중요**: `.hs2-grid-hour-cell`의 background에 `!important`가 없어야 JS inline style (`cell.style.background = color`)이 우선함.

---

## 데이터 구조

### 활동 (Acts)

```js
// localStorage key: ACT_KEY
[
  { id: "act_sleep", name: "수면", emoji: "😴", color: "#2A4A7A", goalH: 7 },
  { id: "act_work",  name: "작업", emoji: "💻", color: "#5A2A7A", goalH: 0 },
  { id: "act_food",  name: "밥",   emoji: "🍚", color: "#2A6A6A", goalH: 0 },
  // 사용자 추가 활동...
]
```

### 타임로그 (Tlog)

```js
// localStorage key: TLOG_KEY
{
  "2026-08-10": [
    { id: "tb_...", actId: "act_sleep", startH: 0, endH: 10, tasks: [] },
    { id: "tb_...", actId: "act_food",  startH: 12, endH: 13, tasks: [] },
  ],
  "2026-08-11": [ ... ],
}
// startH, endH는 정수 (0~24)
// endH - startH = 블록 길이 (시간 단위)
```

**주의**: timelog에 actId가 현재 acts에 없는 경우(활동 삭제 등) → `if (!act) { col.appendChild(cell); continue; }`로 스킵해야 함. 아니면 회색 버그 블록이 생김.

---

## 알려진 이슈 / 주의사항

1. **Git lock 파일**: sandbox에서 macOS 마운트 파일시스템의 `.git/HEAD.lock`, `.git/index.lock` 삭제 안됨. 터미널에서 직접 `rm -f .git/*.lock` 후 push.

2. **캐시 버스팅**: CSS/JS 수정 후 `index.html`의 `?v=N` 올리지 않으면 브라우저가 이전 버전 씀.

3. **HOUR_H 공유**: 노멀 모드의 `_renderWeekGrid`에서 계산된 `_cachedHourH`를 페인트 오버레이에서 재사용. 두 모드의 셀 높이가 정확히 일치해야 함.

4. **inline style vs CSS**: `!important` 있는 CSS 규칙은 inline style 덮어씀. 활동 색상 적용 시 `#historyScreen .hs2-grid-hour-cell`의 background에 `!important` 없어야 함 (현재 없음 ✓).

---

## 최근 작업 히스토리

| 버전 | 변경 내용 |
|------|-----------|
| v126 | 노멀 모드 렌더링 리팩터링: 절대 위치 타임블록 → 셀 직접 색칠 (paint mode와 동일 구조). box-shadow로 연속 셀 gap 채움 |
| v127 | "24" 위 라인 제거 (날짜 헤더 border-bottom 삭제). 시간 레이블 센터 정렬 (노멀+페인트 모드 모두) |
| v127 JS | 삭제된 활동 블록 스킵 처리 (orphaned actId → skip, 기존 동작과 동일) |
| v128 | UX 개선: "블록 채우기"+"활동 추가" 버튼을 헤더에서 제거. 블록 채우기 → 그리드 우상단 연필 아이콘. 활동 추가 → 활동 목록 하단 inline |
| v129 | 노멀 모드 셀 기반 블록에 활동 이름 레이블 추가. 레이블은 블록 전체 높이 기준 중앙에 표시하고, 작업이 달린 블록은 높이가 충분할 때 개수 배지 표시 |
| v130 | 노멀 모드 블록 레이블에서 이모지 제거. 그리드 우상단 편집 버튼 아이콘이 보이도록 원형 아이콘 버튼 스타일 보강 |
| v131 | 페인트 모드에서 삭제된 활동(orphaned actId)을 회색 기본 블록으로 표시하지 않도록 수정. 새로 칠할 때 겹치는 기존 블록을 활동 종류와 관계없이 잘라내도록 보강. 페인트 팔레트 칩에서도 이모지 제거 |
| v132 | 페인트 모드 빈 칸을 투명 처리해 회색 블록처럼 보이지 않게 수정. 페인트 모드 진입/저장/렌더 시 유효하지 않은 timelog 블록 정리. 활동 칩 선택을 pointerdown/click 모두에서 확실히 반영. 노멀 모드 레이블이 셀 겹침에 묻히지 않도록 z-index 보강 |
| v133 | 활동 점 메뉴 깜빡임 방지를 위해 메뉴 닫힘 이벤트를 pointerdown outside 방식으로 안정화. 활동 추가/수정 모달에서 이모지 선택 UI 제거하고 다크 디자인 시스템에 맞게 스타일 재정리 |
| v134 | GitHub Pages는 v133을 배포했지만 브라우저에 이전 모달 DOM/CSS가 남는 사례가 있어 CSS/JS 캐시 버전을 한 번 더 갱신 |
| v135 | 활동 추가/수정 모달에서 목표 시간 필드 제거. 기존 활동의 goalH는 유지하되 모달에서는 더 이상 수정하지 않음 |
| v136 | 반복 선택지를 안함/매일/매주/2주마다/매월/매년/사용자화로 확장. 사용자화 선택 시 반복 주기와 1~365 반복 간격 입력 추가 |

---

## 다음에 할 수 있는 작업들

- 활동 클릭 시 해당 활동으로 블록 추가 모달 (이미 구현됨: `_openAddBlockModal`)
- 페인트 모드에서 선택/저장 후 레이블 갱신 흐름 검증
- 모바일 대응

---

## 미구현 기능 기획: 계획 vs 실행 표시

### 개념

같은 타임테이블에서 **"오늘 뭘 하려고 했는지 (계획)"** 와 **"실제로 뭘 했는지 (실행)"** 를 같이 보여줌.

- 계획 `plan`: 미리 짜둔 일정
- 실행 `actual`: 실제로 기록된 시간 (지금까지 `tlog`에 저장되는 방식)

### 데이터 구조 변경안

tlog 블록에 `type` 필드 추가:

```js
// 현재
{ id: "tb_...", actId: "act_sleep", startH: 0, endH: 8, tasks: [] }

// 변경 후
{ id: "tb_...", actId: "act_sleep", startH: 0, endH: 8, type: "actual", tasks: [] }
{ id: "tb_...", actId: "act_work",  startH: 9, endH: 12, type: "plan",   tasks: [] }
```

- `type` 없으면 기존 호환성 위해 `"actual"` 로 간주
- `type: "plan"` 블록은 미래 날짜 또는 오늘에도 추가 가능

### UI 표현 방향 (미정, 논의 필요)

**옵션 A — 셀 세로 이등분 (권장)**

각 시간 칸을 좌/우로 나눔:
- 왼쪽 절반: 계획 (plan) 색상 — 불투명도 낮게 (opacity ~0.4 or 패턴)
- 오른쪽 절반: 실행 (actual) 색상 — 기존과 동일 (solid)
- 계획만 있으면 왼쪽만 채워짐 → "아직 안 함" 느낌
- 실행만 있으면 오른쪽만 → 기존처럼 보임
- 둘 다 있으면 같은 활동이면 한 칸으로, 다른 활동이면 좌우 다른 색

```
┌────┬────┐
│계획│실행│  ← 같은 활동 → 하나로 합침
└────┴────┘

┌────┬────┐
│ 수면│ 작업│  ← 다른 활동 → 색 다르게
└────┴────┘
```

**옵션 B — 투명도로 구분**

- 계획: 활동 색상 + `opacity: 0.3` + `border: 1px dashed actColor`
- 실행: 활동 색상 solid (현재 방식)
- 같은 시간에 계획/실행 겹치면 실행이 위에 렌더링

구현 간단하지만 다른 활동이 같은 시간에 계획/실행으로 겹칠 경우 정보가 가려짐.

**옵션 C — 별도 컬럼 (plan / actual 모드 전환)**

topbar에 토글 추가: `계획 | 실행 | 둘 다`  
모드에 따라 `type: "plan"` 블록만, `type: "actual"` 블록만, 또는 둘 다 표시.

심플하지만 한눈에 비교가 안됨.

### 블록 채우기(페인트) 모드 연동

페인트 모드 topbar에 "계획" / "실행" 선택 칩 추가:
```
[ 수면 ] [ 작업 ] [ 밥 ]       ← 활동 팔레트 (기존)
[ 계획으로 ] [ 실행으로 ]       ← 타입 선택 (신규)
```
칠할 때 선택된 타입이 블록에 저장됨.

### 구현 순서 (추천)

1. `type` 필드 데이터 구조 추가 + 기존 블록 마이그레이션 (`type` 없으면 `"actual"`)
2. 페인트 모드에 plan/actual 토글 추가
3. `_renderWeekGrid`에서 plan/actual 분리 렌더링 (옵션 A 또는 B 선택 후)
4. 노멀 모드 셀 렌더링에서 plan 블록은 다른 스타일로 표현

### 주의사항

- 같은 시간에 plan 블록과 actual 블록이 동시에 존재할 수 있음 → `blocks.find()` 대신 `blocks.filter()`로 해당 시간의 모든 블록 가져와야 함
- 현재 `_openTaskPanel(dt, blk, act)` 클릭 핸들러도 plan/actual 구분해서 다르게 열어야 할 수 있음
