// lib/movieTagger.ts
// 영화에 감정 메타데이터를 붙이는 스키마 + Claude 기반 태거
// TMDB가 주는 장르/줄거리와 별도로, "이 영화가 어떤 사람에게 뭘 해주는가"를 저장

import Anthropic from "@anthropic-ai/sdk";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 감정 태그 스키마
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MovieEmotionalTag {
  tmdbId: number;
  title: string;
  titleKo?: string;

  // 이 영화가 주는 감정 효과
  emotionalEffects: string[];
  // 예: "번아웃에서 위로", "불안을 거대한 웃음으로 희석", "자기의심에 공감"

  // 언제 보면 좋은가
  whenToWatch: string[];
  // 예: "실연 후", "번아웃", "비 오는 날", "잠 안 올 때", "취업 실패 후"

  // 톤 수치 (0~10)
  tone: {
    warmth: number; // 따뜻함 (0=차가움, 10=아주 따뜻함)
    pace: number; // 속도감 (0=아주 느림, 10=빠름)
    humor: number; // 웃음 (0=전혀 없음, 10=코미디)
    heaviness: number; // 무게감 (0=가벼움, 10=무거움)
    hope: number; // 희망적 (0=절망적, 10=아주 희망적)
  };

  // 핵심 심리 주제
  coreThemes: string[];
  // 예: "자기의심", "상실", "작은 용기", "관계 피로", "존재의 무의미함"

  // 에너지 낮을 때 적합한가
  goodForLowEnergy: boolean;

  // 한 줄 감정 설명 (추천 이유 생성에 사용)
  emotionalDescription: string;
  // 예: "자기의심과 무력감 속에서 뭔가 만들어보려는 사람에게 깊은 공감을 줌"

  // 추천하지 말아야 할 상태
  notRecommendedFor: string[];
  // 예: ["심한 우울증", "실연 직후"]

  generatedAt: string; // ISO 날짜
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Claude API로 영화 감정 태그 생성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TAGGER_PROMPT = `당신은 영화의 감정적 효과를 분석하는 전문가입니다.
영화의 줄거리, 장르, 분위기를 보고 "이 영화가 어떤 감정 상태의 사람에게 무엇을 해주는가"를 분석하세요.

중요: 장르나 플롯이 아니라 심리적/감정적 효과를 중심으로 분석하세요.

예시:
- "어댑테이션(2002)": 구직 영화가 아님. 자기의심과 무력감 속에서 뭔가 만들려는 사람에게 깊은 공감을 줌.
- "은하수를 여행하는 히치하이커를 위한 안내서": SF가 아님. 만성 불안을 우주적 부조리로 희석시켜주는 영화. 잠 오게 만드는 힘이 있음.

다음 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{
  "emotionalEffects": ["효과1", "효과2"],
  "whenToWatch": ["상황1", "상황2", "상황3"],
  "tone": {
    "warmth": 0-10,
    "pace": 0-10,
    "humor": 0-10,
    "heaviness": 0-10,
    "hope": 0-10
  },
  "coreThemes": ["주제1", "주제2"],
  "goodForLowEnergy": true/false,
  "emotionalDescription": "한 줄 감정 설명",
  "notRecommendedFor": ["상태1", "상태2"]
}`;

export async function generateMovieEmotionalTag(
  movie: {
    tmdbId: number;
    title: string;
    titleKo?: string;
    overview: string;
    genres: string[];
    releaseYear: number;
  },
  apiKey: string
): Promise<MovieEmotionalTag> {
  const client = new Anthropic({ apiKey });

  const movieInfo = `
제목: ${movie.title}${movie.titleKo ? ` (${movie.titleKo})` : ""}
개봉연도: ${movie.releaseYear}
장르: ${movie.genres.join(", ")}
줄거리: ${movie.overview}
`.trim();

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 600,
    system: TAGGER_PROMPT,
    messages: [{ role: "user", content: movieInfo }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  try {
    const parsed = JSON.parse(text);
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      titleKo: movie.titleKo,
      ...parsed,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    // 파싱 실패 시 기본 태그 반환
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      titleKo: movie.titleKo,
      emotionalEffects: ["다양한 감정 경험"],
      whenToWatch: ["언제든"],
      tone: { warmth: 5, pace: 5, humor: 5, heaviness: 5, hope: 5 },
      coreThemes: ["인생"],
      goodForLowEnergy: true,
      emotionalDescription: movie.overview.slice(0, 100),
      notRecommendedFor: [],
      generatedAt: new Date().toISOString(),
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 감정 태그 DB (JSON 파일) 로드/저장
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import fs from "fs";
import path from "path";

const TAG_DB_PATH = path.join(process.cwd(), "data", "movieEmotionTags.json");

export function loadEmotionTagDB(): Record<number, MovieEmotionalTag> {
  try {
    if (!fs.existsSync(TAG_DB_PATH)) return {};
    const raw = fs.readFileSync(TAG_DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveEmotionTagDB(db: Record<number, MovieEmotionalTag>): void {
  const dir = path.dirname(TAG_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TAG_DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export function getMovieTag(
  tmdbId: number
): MovieEmotionalTag | null {
  const db = loadEmotionTagDB();
  return db[tmdbId] ?? null;
}
