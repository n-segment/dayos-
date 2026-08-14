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

- `ui.css?v=137`
- `ui.js?v=137`

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

    // v137부터 타임테이블 활동 블록은 각진 사각형으로 표시
    cell.style.borderRadius = "0";

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
- "블록 채우기" → 직접 조작 흐름으로 대체되어 별도 버튼 제거
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
| v128 | UX 개선: "블록 채우기"+"활동 추가" 버튼을 헤더에서 제거. 활동 추가 → 활동 목록 하단 inline |
| v129 | 노멀 모드 셀 기반 블록에 활동 이름 레이블 추가. 레이블은 블록 전체 높이 기준 중앙에 표시하고, 작업이 달린 블록은 높이가 충분할 때 개수 배지 표시 |
| v130 | 노멀 모드 블록 레이블에서 이모지 제거. 그리드 우상단 편집 버튼 아이콘이 보이도록 원형 아이콘 버튼 스타일 보강 |
| v131 | 페인트 모드에서 삭제된 활동(orphaned actId)을 회색 기본 블록으로 표시하지 않도록 수정. 새로 칠할 때 겹치는 기존 블록을 활동 종류와 관계없이 잘라내도록 보강. 페인트 팔레트 칩에서도 이모지 제거 |
| v132 | 페인트 모드 빈 칸을 투명 처리해 회색 블록처럼 보이지 않게 수정. 페인트 모드 진입/저장/렌더 시 유효하지 않은 timelog 블록 정리. 활동 칩 선택을 pointerdown/click 모두에서 확실히 반영. 노멀 모드 레이블이 셀 겹침에 묻히지 않도록 z-index 보강 |
| v133 | 활동 점 메뉴 깜빡임 방지를 위해 메뉴 닫힘 이벤트를 pointerdown outside 방식으로 안정화. 활동 추가/수정 모달에서 이모지 선택 UI 제거하고 다크 디자인 시스템에 맞게 스타일 재정리 |
| v134 | GitHub Pages는 v133을 배포했지만 브라우저에 이전 모달 DOM/CSS가 남는 사례가 있어 CSS/JS 캐시 버전을 한 번 더 갱신 |
| v135 | 활동 추가/수정 모달에서 목표 시간 필드 제거. 기존 활동의 goalH는 유지하되 모달에서는 더 이상 수정하지 않음 |
| v136 | 반복 선택지를 안함/매일/매주/2주마다/매월/매년/사용자화로 확장. 사용자화 선택 시 반복 주기와 1~365 반복 간격 입력 추가 |
| v137 | 노멀 모드 타임테이블 활동 블록의 border radius 제거. 우상단 편집 버튼을 파란색 아이콘 버튼으로 강조 |

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

### 2026-08-14 구현 상태

- `tlog` 블록에 `type: "plan" | "actual"` 필드 추가
- 기존 `type` 없는 블록은 호환을 위해 `actual`로 정규화
- 활동 카드 시간 추가, 활동 추가/수정 반복 생성, 직접 블록 수정 모달에 `계획/실행` 선택 추가
- 기본 새 블록은 `계획`으로 생성
- 같은 시간에 계획과 실행은 동시에 존재 가능
- 겹침 안내는 같은 타입 안에서만 검사
- 주간 그리드는 한 시간 칸을 좌우로 나누어 왼쪽 `계획`, 오른쪽 `실행`으로 표시
- 블록 채우기 모드에도 `계획/실행` 토글 추가
- 평소 타임 테이블은 `계획` 모드로 보여주고, 상단 토글에서 `계획 / 실행 / 둘 다`를 전환한다.
- `둘 다` 모드에서만 한 칸을 좌우로 나누어 계획과 실행을 동시에 비교한다.
- 타임 테이블 블록 위 오른쪽 클릭은 브라우저 기본 영어 메뉴 대신 앱 내부 한글 메뉴(`할 일 보기`, `시간 수정`, `삭제`)를 띄운다.
- `계획 / 실행 / 둘 다` 토글은 날짜 이동 topbar 안에 둔다.
- 하단 `홈 / 타임 테이블` 플로팅 메뉴는 타임테이블 화면에서 시간표를 가리지 않도록 기본적으로 아래로 숨긴다. 화면 맨 아래 중앙의 작은 10px 감지 영역에 마우스가 들어오면 다시 나타나게 한다.

## 추세 화면 아이디어 — 보류

### 상태

아직 디자인을 확정하지 않음. 지금 당장은 시간 계획/기록 화면이 메인이고, 추세 화면은 나중에 다시 설계한다.

### 방향 메모

- 추세는 각 활동 항목별로 보여주는 보조 화면
- 예: 수면, 밥, 운동 같은 활동을 선택하면 해당 활동의 기간별 누적/패턴/목표 대비를 보여줌
- 현재 화면 구조가 이미 왼쪽 사이드바 + 오른쪽 메인으로 나뉘어 있으므로, 플로팅 메뉴를 크게 추가하기보다 오른쪽 메인 안에서 화면 전환하는 방향이 유력함
- 하단에 작은 `계획 | 추세` 전환 메뉴를 두는 안을 후보로 남김
- 다만 추세 디자인은 아직 어렵고 우선순위가 아니므로 구현하지 않음

### 결정

추세 화면은 지금 만들지 않고, 나중에 디자인이 정해진 뒤 구현한다.

## 홈/타임 테이블 화면 구조

### 결정

로그인 후 첫 화면은 타임 테이블이 아니라 **홈 화면**으로 둔다. 홈은 다이어리 표지처럼 메모, 음악, 낙서, 링크 등을 붙이는 공간으로 유지한다.

### 현재 메뉴 구조

- 하단 플로팅 메뉴를 둔다
- 우선 메뉴 항목은 `홈`, `타임 테이블` 두 개만 둔다
- `홈`은 기존 `homeSection`을 보여주고 `historyScreen`을 숨긴다
- `타임 테이블`은 기존 `historyScreen`을 열어서 주간 시간표를 보여준다
- 추세 화면은 아직 메뉴에 넣지 않는다

### 이유

앱의 원래 목적이 시간표만 보는 것이 아니라, 하루를 시작하는 다이어리 표지 같은 공간을 만드는 것이므로 홈을 첫 화면으로 복구한다. 타임 테이블은 하단 플로팅 메뉴에서 들어가는 주요 기능으로 둔다.

## 타이머 기능 제거 방향

### 결정

시간을 재는 타이머 기능은 앱의 핵심에서 제외한다. DayOS는 작업 시간을 측정하는 앱보다, 홈 표지와 타임 테이블을 통해 하루를 계획하고 기록하는 앱으로 방향을 잡는다.

### 적용한 것

- 홈 화면의 `시작하기` 버튼 제거
- 타임 테이블 사이드바의 `시작하기` 타이머 박스 제거
- 기존 워크스페이스 타이머 섹션은 화면에서 숨김
- 로그인 후 기존 타이머 상태가 자동으로 켜지지 않도록 막음

### 나중에 정리할 것

타이머 관련 함수와 저장 키는 아직 코드에 남아 있다. UI 구조가 안정된 뒤 사용하지 않는 세션/체크인/요약 코드를 별도 정리한다.

## 홈 화면 꾸미기 모드 / 프로필

### 결정

홈 화면은 기본 상태에서는 깨끗한 다이어리 표지처럼 보여주고, 꾸미기 도구는 `화면 꾸미기` 모드에서만 보여준다. 꾸미기 결과물도 홈 화면에만 보이고 타임 테이블에서는 보이지 않게 한다.

### 적용한 것

- 헤더에 `화면 꾸미기` 버튼 추가
- `화면 꾸미기` 모드에서만 음악, 낙서, 링크 임베드, 메모 추가 도구 표시
- `화면 꾸미기` 모드에서 이미지/영상 파일을 홈 배경으로 설정 가능
- 홈 배경 미디어는 IndexedDB에 Blob으로 저장해서 큰 영상도 localStorage보다 안전하게 보관
- 타임 테이블로 이동하면 화면 꾸미기 모드 자동 종료
- 타임 테이블에서는 낙서 캔버스, 메모, 임베드 카드, 꾸미기 도구 숨김
- 화면 꾸미기 모드를 끄면 열린 음악/메모/링크 패널 닫기
- 헤더 오른쪽에 프로필 버튼 추가
- 프로필 메뉴에서 계정 정보와 로그아웃 제공
- 로컬 개발 모드는 프로필에 `로컬 모드`로 표시

### 방향

홈의 꾸미기 기능은 기능 버튼이 계속 보이는 도구 앱처럼 두지 않고, 필요할 때만 들어가는 화면 꾸미기 상태로 관리한다.

### 추가 결정

- 음악은 화면 꾸미기 도구에서 분리한다. 홈을 꾸미는 기능이라기보다 앱을 쓰는 동안 따로 켜둘 수 있는 기능으로 본다.
- 화면 꾸미기에는 낙서, 링크, 메모, 배경 이미지/영상 변경을 둔다.
- 지우개는 상단 화면 꾸미기 도구 줄에 두지 않고, 낙서 모드에서 열리는 하단 플로팅 툴바 안에만 제공한다.
- 낙서 모드가 켜져 있을 때는 낙서 아이콘을 움직여 현재 편집 중임을 보여준다.
- 첫 진입 시 온보딩을 띄워 `화면 꾸미기`와 `타임 테이블`의 역할을 짧게 안내한다.
- 활동 추가/편집 모달의 시간/반복 선택은 브라우저 기본 select 드롭다운 대신 앱 내부 커스텀 메뉴로 표시한다. macOS 기본 흰색 선택 패널이 뜨지 않게 하기 위함이다.
- 타임 테이블 사이드바의 `일일 활동` 시간 칩은 주간 합계가 아니라 현재 선택된 하루 기준 합계를 보여준다.
- 타임 테이블 시간 블록을 추가/수정할 때 다른 활동과 시간이 겹치면 저장하지 않고 짧은 겹침 안내를 띄운다. 같은 활동을 이어붙이는 입력은 기존 병합 동작을 유지한다.
- 활동 추가/편집 모달은 `시작`과 `종료` 시간을 나란히 선택하게 하고, `얼마나`를 입력하면 종료가 바뀌며 종료를 바꾸면 시간이 자동 계산되게 한다.
- 타임 테이블 블록 추가 모달의 날짜 선택은 브라우저 기본 date picker 대신 앱 디자인 시스템에 맞춘 어두운 커스텀 캘린더 팝오버로 표시한다.
- 계획/실행 시간 입력은 select가 아니라 텍스트 입력으로 통일한다. `9:30`, `14:05`, `오후 3:20`, `1시간 30분`, `90분`처럼 분 단위 입력을 받을 수 있게 한다.
- 시간 수정 모달에도 `얼마나` 입력을 추가해서 추가/수정 흐름의 시작/종료/기간 입력 방식을 맞춘다. 계획 블록은 opacity를 쓰지 않고 실행색보다 한 단계 밝은 실제 색상으로 표시한다.
- 타임 테이블 블록 hover는 시간 칸마다 나뉘지 않고, 색칠된 일정 블록 전체가 한 번에 반응하게 한다.
- 타임 테이블의 시간 칸 hover는 제거하고 색칠된 활동 블록만 hover 대상으로 둔다. 계획 보기에서는 블록 전체를 위/아래로 드래그해서 기간은 유지한 채 시작 시간만 15분 단위로 조정할 수 있게 한다.
- `둘 다` 보기에서는 좁은 반쪽 블록 안에서 `계획/실행` 라벨까지 넣으면 활동명이 가려지므로, 블록 내부에는 활동명만 표시하고 라벨은 색/위치/상단 토글로 구분한다.
- 계획/실행 단일 보기에서는 해당 타입의 블록을 드래그해서 기간은 유지한 채 시작 시간을 조정한다. `둘 다` 보기는 비교 전용으로 두고 드래그 편집은 막아둔다.
- `실행` 블록은 실제 기록이므로 활동/블록 추가 모달에서 반복 설정을 숨기고 저장 시 반복을 `안함`으로 고정한다.
- 타임 테이블 block hover는 색상 필터로 조각마다 밝히지 않고, 블록 전체 위에 얇은 하이라이트 레이어를 올려 칸 경계가 어색하게 보이지 않게 한다.
- 직접 조작 흐름이 정리되었으므로 타임 테이블 우상단 연필/블록 채우기 버튼은 제거한다. 빈 시간 추가, 블록 클릭/우클릭/드래그로 편집한다.
- `둘 다` 보기의 블록 라벨은 시작 지점이 시간 경계에 너무 가까울 때 잘리지 않도록 블록 시작 조각이 아니라 블록 중앙이 들어가는 칸에 표시한다.
- `둘 다` 보기에서 라벨 위치와 hover/drag 영역을 분리한다. 라벨은 중앙 칸에 표시하되 hover 영역은 블록 시작부터 끝까지 정확히 잡는다.

### 온보딩 문구

- 화면 꾸미기: 좋아하는 이미지나 영상, 낙서와 메모를 홈 화면에 올려두고 원하는 대로 화면을 꾸밀 수 있다.
- 타임 테이블: 시간 단위로 하루 계획을 짤 수 있다. 해야 할 일을 시간표에 배치하면서 원하는 하루를 만들 수 있다.

## 추세 화면 메모

각 활동 항목별로 장기 추세를 보여주는 화면은 나중에 설계한다. 지금은 디자인 방향이 아직 정해지지 않았으므로 메뉴에 넣지 않고 기록만 남긴다.

## 로그인 구조 메모

### 현재 이슈

로컬 테스트에서 `signInWithPopup`을 쓰면 Firebase Auth 핸들러 페이지(`dayos-a94ff.firebaseapp.com/__/auth/handler`)가 브라우저에 직접 열리면서 `The requested action is invalid.`가 뜰 수 있다.

### 수정 방향

- 로컬 주소(`localhost`, `127.0.0.1`)에서는 Google 로그인을 `signInWithRedirect`로 처리
- 배포 주소에서는 기존처럼 `signInWithPopup` 우선 사용
- redirect 결과 에러는 `getRedirectResult()`에서 잡아서 표시

### Firebase 콘솔에서 확인할 것

Firebase Console → Authentication → Settings → Authorized domains에 아래 도메인이 들어가 있어야 한다.

- `localhost`
- `127.0.0.1`
- `n-segment.github.io`

### 로컬 개발 우회

Codex 인앱 브라우저에서는 Firebase popup/redirect 핸들러가 부모 창과 정상 연결되지 않아 로그인 플로우가 멈출 수 있다. 로컬 개발 환경에서는 `로컬로 보기` 버튼을 표시해서 Firebase 로그인 없이 앱 UI로 들어갈 수 있게 한다.

- `localhost`, `127.0.0.1`에서만 `로컬로 보기` 표시
- 로컬 모드는 `currentUser.isLocalDev = true`
- 로컬 모드에서는 Firestore 호출을 건너뛰고 localStorage 기반 기능만 사용
- 실제 배포/사용자 로그인은 기존 Google 로그인 유지
