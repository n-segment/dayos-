// scripts/generateMovieTags.ts
// 영화 감정 태그 사전 생성 스크립트 (1회 실행)
//
// 실행 방법:
//   npx tsx scripts/generateMovieTags.ts
//
// 이 스크립트는 TMDB에서 인기 영화를 가져와 Claude API로 감정 태그를 생성하고
// data/movieEmotionTags.json에 저장합니다.
// 한 번 저장한 영화는 재생성하지 않아요 (API 비용 절약).

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import {
  generateMovieEmotionalTag,
  loadEmotionTagDB,
  saveEmotionTagDB,
} from "../lib/movieTagger";

// ── 설정 ──────────────────────────────
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;
const TMDB_BASE = "https://api.themoviedb.org/3";

// 한 번에 처리할 영화 수 (API 비용 주의)
const TARGET_MOVIE_COUNT = 200;
// 요청 사이 딜레이 (ms) - Claude API 속도 제한 방지
const DELAY_MS = 500;

// 처리할 TMDB 장르 ID (다양성을 위해 여러 장르 포함)
const GENRE_PAGES: Array<{ genreId: number; label: string }> = [
  { genreId: 18, label: "드라마" },
  { genreId: 35, label: "코미디" },
  { genreId: 878, label: "SF" },
  { genreId: 14, label: "판타지" },
  { genreId: 12, label: "어드벤처" },
  { genreId: 10749, label: "로맨스" },
  { genreId: 16, label: "애니메이션" },
  { genreId: 99, label: "다큐멘터리" },
];

// ── 헬퍼 ──────────────────────────────
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMoviesByGenre(
  genreId: number,
  pages = 3
): Promise<Array<{
  id: number;
  title: string;
  overview: string;
  genre_ids: number[];
  release_date: string;
}>> {
  const results = [];

  for (let page = 1; page <= pages; page++) {
    const url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=1000&language=ko-KR&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) continue;

    const data = await res.json();
    results.push(...(data.results || []));
    await sleep(100);
  }

  return results;
}

// ── 메인 ──────────────────────────────
async function main() {
  console.log("🎬 영화 감정 태그 생성 시작\n");

  if (!TMDB_KEY || !ANTHROPIC_KEY) {
    console.error(
      "❌ NEXT_PUBLIC_TMDB_API_KEY 또는 ANTHROPIC_API_KEY가 없습니다."
    );
    console.error("   .env.local 파일을 확인해주세요.");
    process.exit(1);
  }

  // 기존 DB 로드
  const db = loadEmotionTagDB();
  const existingIds = new Set(Object.keys(db).map(Number));
  console.log(`📂 기존 태그: ${existingIds.size}편\n`);

  // 영화 수집
  console.log("📡 TMDB에서 영화 목록 수집 중...");
  const movieMap = new Map<number, { id: number; title: string; overview: string; genre_ids: number[]; release_date: string }>();

  for (const { genreId, label } of GENRE_PAGES) {
    const movies = await fetchMoviesByGenre(genreId, 2);
    movies.forEach((m) => {
      if (m.overview && !movieMap.has(m.id)) {
        movieMap.set(m.id, m);
      }
    });
    console.log(`  ${label}: ${movies.length}편 수집`);
    await sleep(200);
  }

  // 신규 영화만 필터링
  const toProcess = Array.from(movieMap.values())
    .filter((m) => !existingIds.has(m.id) && m.overview.length > 50)
    .slice(0, TARGET_MOVIE_COUNT - existingIds.size);

  console.log(`\n🔄 처리할 신규 영화: ${toProcess.length}편`);

  if (toProcess.length === 0) {
    console.log("✅ 모든 영화가 이미 태깅되어 있습니다!");
    return;
  }

  // 태그 생성
  let processed = 0;
  let failed = 0;

  for (const movie of toProcess) {
    try {
      process.stdout.write(
        `[${processed + 1}/${toProcess.length}] ${movie.title}... `
      );

      const tag = await generateMovieEmotionalTag(
        {
          tmdbId: movie.id,
          title: movie.title,
          overview: movie.overview,
          genres: movie.genre_ids.map(String),
          releaseYear: parseInt(movie.release_date?.slice(0, 4) || "2000"),
        },
        ANTHROPIC_KEY
      );

      db[movie.id] = tag;
      processed++;

      console.log(`✓ (${tag.emotionalEffects[0] || "태깅 완료"})`);

      // 10개마다 중간 저장
      if (processed % 10 === 0) {
        saveEmotionTagDB(db);
        console.log(`\n💾 중간 저장 (${processed}편 완료)\n`);
      }

      await sleep(DELAY_MS);
    } catch (err) {
      failed++;
      console.log(`✗ 실패: ${err}`);
      await sleep(1000); // 오류 시 더 기다림
    }
  }

  // 최종 저장
  saveEmotionTagDB(db);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ 완료!`);
  console.log(`   성공: ${processed}편`);
  console.log(`   실패: ${failed}편`);
  console.log(`   전체 DB: ${Object.keys(db).length}편`);
  console.log(`   저장 위치: data/movieEmotionTags.json`);
}

main().catch(console.error);
