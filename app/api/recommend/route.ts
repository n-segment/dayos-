// app/api/recommend/route.ts
// 감정 기반 영화 추천 파이프라인 (2단계)
//
// phase: "analyze"    → 감정 분석만 수행 (전략 선택 전)
// phase: "recommend"  → 전략 포함해서 영화 추천 (전략 선택 후)

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  parseEmotionalState,
  parseEmotionalStateLocal,
  type EmotionalState,
} from "@/lib/emotionParser";
import {
  generateMovieEmotionalTag,
  getMovieTag,
  loadEmotionTagDB,
  saveEmotionTagDB,
  type MovieEmotionalTag,
} from "@/lib/movieTagger";
import type { RecommendStrategy } from "@/components/StrategyPicker";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  poster_path: string | null;
}

interface RecommendedMovie {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  releaseYear: number;
  voteAverage: number;
  recommendReason: string;
  emotionalMatch: string;
  watchProviders?: WatchProvider[];
}

interface WatchProvider {
  provider_name: string;
  logo_path: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TMDB 헬퍼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 전략별 TMDB 장르 매핑
function getGenresForStrategy(
  state: EmotionalState,
  strategy: RecommendStrategy
): number[] {
  if (strategy === "empathy") {
    // 공감형: 현실적인 인간 드라마 중심
    return [18, 10749, 36]; // Drama, Romance, History
  } else {
    // 전환형: 현실 탈출 장르 중심
    // 에너지 낮으면 잔잔한 판타지, 높으면 액션/SF
    if (state.energyLevel === "very_low" || state.energyLevel === "low") {
      return [14, 16, 10751]; // Fantasy, Animation, Family
    } else {
      return [878, 12, 28]; // SciFi, Adventure, Action
    }
  }
}

async function fetchTMDBCandidates(
  state: EmotionalState,
  strategy: RecommendStrategy,
  page = 1
): Promise<TMDBMovie[]> {
  const genreIds = getGenresForStrategy(state, strategy);
  const genreParam = genreIds.slice(0, 2).join("|");

  const sortBy =
    state.energyLevel === "very_low" || state.energyLevel === "low"
      ? "vote_average.desc"
      : "popularity.desc";

  const url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&with_genres=${genreParam}&sort_by=${sortBy}&vote_count.gte=500&language=ko-KR&page=${page}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).slice(0, 20) as TMDBMovie[];
}

async function fetchWatchProviders(tmdbId: number): Promise<WatchProvider[]> {
  const url = `${TMDB_BASE}/movie/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const kr = data.results?.KR;
    return kr?.flatrate || kr?.rent || [];
  } catch {
    return [];
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전략별 Claude 재정렬 프롬프트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getRerankPrompt(strategy: RecommendStrategy): string {
  const base = `당신은 사람의 감정 상태를 깊이 이해하고 딱 맞는 영화를 추천하는 전문가입니다.
친근하고 따뜻한 말투로 추천 이유를 써주세요. (반말 금지, 너무 격식도 금지)
각 추천 이유는 2~3문장으로.

JSON 형식으로만 응답하세요:
{
  "selected": [
    {
      "tmdbId": 숫자,
      "recommendReason": "추천 이유 2~3문장",
      "emotionalMatch": "핵심 한 줄 — 왜 지금 이 영화인가"
    }
  ]
}`;

  if (strategy === "empathy") {
    return `${base}

전략: 공감형 추천
- "나만 이런 거 아니구나" 싶은 영화를 골라주세요
- 주인공이 사용자와 비슷한 감정적 상황(자기의심, 번아웃, 불안, 실패 등)을 겪는 영화
- 추천 이유: "이 주인공도 ~한 상황이었는데..." 형식으로 공감 포인트를 짚어주세요
- 화려한 성공 스토리보다는 현실적인 고군분투가 담긴 영화`;
  } else {
    return `${base}

전략: 전환형 추천
- 지금 현실을 완전히 잊게 만드는 영화를 골라주세요
- 사용자의 현재 상황과 정반대의 세계관, 강렬한 시각적/서사적 몰입감
- 추천 이유: "이 영화를 보는 동안은 ~을 완전히 잊을 수 있어요" 형식
- 에너지가 낮다면: 잔잔하지만 다른 세계로 데려가는 영화. 높다면: 강렬한 몰입감`;
  }
}

async function rerankWithClaude(
  state: EmotionalState,
  strategy: RecommendStrategy,
  candidates: Array<{ movie: TMDBMovie; tag: MovieEmotionalTag }>,
  userInput: string,
  apiKey: string
): Promise<
  Array<{ tmdbId: number; recommendReason: string; emotionalMatch: string }>
> {
  const client = new Anthropic({ apiKey });

  const candidateList = candidates
    .map(
      ({ movie, tag }, i) =>
        `[${i + 1}] tmdbId: ${movie.id}
제목: ${movie.title}
감정 효과: ${tag.emotionalEffects.join(", ")}
언제 보면 좋은가: ${tag.whenToWatch.join(", ")}
핵심 주제: ${tag.coreThemes.join(", ")}
감정 설명: ${tag.emotionalDescription}
에너지 낮을 때 적합: ${tag.goodForLowEnergy ? "예" : "아니오"}`
    )
    .join("\n\n");

  const userContext = `사용자 입력: "${userInput}"

감정 상태:
- 현재 감정: ${state.emotions.join(", ")}
- 필요한 것: ${state.needs.join(", ")}
- 에너지 레벨: ${state.energyLevel}
- 원하는 톤: ${state.preferredTone.join(", ")}
- 피해야 할 것: ${state.avoidThemes.join(", ")}
- 상황 요약: ${state.situationContext}

선택한 전략: ${strategy === "empathy" ? "공감형 (나 같은 상황의 주인공)" : "전환형 (완전히 다른 세계로 도피)"}

후보 영화:
${candidateList}

이 사람의 감정 상태와 선택한 전략에 가장 잘 맞는 영화 3편을 골라주세요.`;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1200,
    system: getRerankPrompt(strategy),
    messages: [{ role: "user", content: userContext }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  try {
    const parsed = JSON.parse(text);
    return parsed.selected || [];
  } catch {
    return candidates.slice(0, 3).map(({ movie, tag }) => ({
      tmdbId: movie.id,
      recommendReason: tag.emotionalDescription,
      emotionalMatch: tag.whenToWatch[0] || "지금 이 영화를 추천해요",
    }));
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 1: 감정 분석만
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleAnalyze(userInput: string) {
  const emotionalState = ANTHROPIC_KEY
    ? await parseEmotionalState(userInput, ANTHROPIC_KEY)
    : parseEmotionalStateLocal(userInput);

  return NextResponse.json({ emotionalState });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2: 전략 포함 영화 추천
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleRecommend(
  userInput: string,
  emotionalState: EmotionalState,
  strategy: RecommendStrategy
) {
  // TMDB 후보 검색
  const candidates = await fetchTMDBCandidates(emotionalState, strategy);
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "영화를 찾지 못했어요. 다시 시도해주세요." },
      { status: 500 }
    );
  }

  // 감정 태그 조회/생성
  const tagDB = loadEmotionTagDB();
  let dbUpdated = false;

  const candidatesWithTags = await Promise.all(
    candidates.map(async (movie) => {
      let tag = getMovieTag(movie.id);

      if (!tag && ANTHROPIC_KEY) {
        tag = await generateMovieEmotionalTag(
          {
            tmdbId: movie.id,
            title: movie.title,
            overview: movie.overview,
            genres: movie.genre_ids.map(String),
            releaseYear: parseInt(movie.release_date?.slice(0, 4) || "2000"),
          },
          ANTHROPIC_KEY
        );
        tagDB[movie.id] = tag;
        dbUpdated = true;
      }

      return tag ? { movie, tag } : null;
    })
  );

  if (dbUpdated) {
    try {
      saveEmotionTagDB(tagDB);
    } catch {
      // 저장 실패해도 추천 계속
    }
  }

  const validCandidates = candidatesWithTags.filter(
    (c): c is { movie: TMDBMovie; tag: MovieEmotionalTag } => c !== null
  );

  // Claude 재정렬
  let selected: Array<{
    tmdbId: number;
    recommendReason: string;
    emotionalMatch: string;
  }>;

  if (ANTHROPIC_KEY && validCandidates.length > 0) {
    selected = await rerankWithClaude(
      emotionalState,
      strategy,
      validCandidates,
      userInput,
      ANTHROPIC_KEY
    );
  } else {
    selected = validCandidates.slice(0, 3).map(({ movie, tag }) => ({
      tmdbId: movie.id,
      recommendReason: tag.emotionalDescription,
      emotionalMatch: tag.whenToWatch[0] || "지금 이 영화를 추천해요",
    }));
  }

  // OTT 정보 병렬 조회
  const finalMovies: RecommendedMovie[] = (
    await Promise.all(
      selected.map(async ({ tmdbId, recommendReason, emotionalMatch }) => {
        const movie = candidates.find((m) => m.id === tmdbId);
        if (!movie) return null;

        const providers = await fetchWatchProviders(tmdbId);

        return {
          tmdbId,
          title: movie.title,
          posterUrl: movie.poster_path
            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
            : null,
          releaseYear: parseInt(movie.release_date?.slice(0, 4) || "0"),
          voteAverage: movie.vote_average,
          recommendReason,
          emotionalMatch,
          watchProviders: providers,
        } satisfies RecommendedMovie;
      })
    )
  ).filter((m): m is RecommendedMovie => m !== null);

  return NextResponse.json({
    movies: finalMovies,
    strategy,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 핸들러
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phase, userInput, emotionalState, strategy } = body;

    if (!userInput || typeof userInput !== "string") {
      return NextResponse.json(
        { error: "userInput이 필요합니다" },
        { status: 400 }
      );
    }

    if (phase === "analyze") {
      return await handleAnalyze(userInput);
    }

    if (phase === "recommend") {
      if (!emotionalState || !strategy) {
        return NextResponse.json(
          { error: "emotionalState와 strategy가 필요합니다" },
          { status: 400 }
        );
      }
      return await handleRecommend(userInput, emotionalState, strategy);
    }

    return NextResponse.json({ error: "알 수 없는 phase입니다" }, { status: 400 });
  } catch (err) {
    console.error("[recommend] error:", err);
    return NextResponse.json(
      { error: "오류가 발생했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
