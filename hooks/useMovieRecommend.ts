"use client";

// hooks/useMovieRecommend.ts
// 영화 추천 전체 흐름을 관리하는 커스텀 훅
//
// 흐름:
// idle → analyzing (감정 분석) → picking_strategy (버튼 선택 대기)
//      → recommending (영화 검색) → done
//                                  → error

import { useState, useCallback } from "react";
import type { EmotionalState } from "@/lib/emotionParser";
import type { RecommendStrategy } from "@/components/StrategyPicker";

export type RecommendPhase =
  | "idle"             // 초기 상태
  | "analyzing"        // 감정 분석 중
  | "picking_strategy" // 전략 선택 대기
  | "recommending"     // 영화 추천 중
  | "done"             // 완료
  | "error";           // 오류

export interface RecommendedMovie {
  tmdbId: number;
  title: string;
  titleKo?: string;
  posterUrl: string | null;
  releaseYear: number;
  voteAverage: number;
  recommendReason: string;
  emotionalMatch: string;
  watchProviders?: Array<{
    provider_name: string;
    logo_path: string;
  }>;
}

export interface RecommendState {
  phase: RecommendPhase;
  userInput: string;
  emotionalState: EmotionalState | null;
  strategy: RecommendStrategy | null;
  movies: RecommendedMovie[];
  error: string | null;
}

const INITIAL_STATE: RecommendState = {
  phase: "idle",
  userInput: "",
  emotionalState: null,
  strategy: null,
  movies: [],
  error: null,
};

export function useMovieRecommend() {
  const [state, setState] = useState<RecommendState>(INITIAL_STATE);

  // ── 1단계: 고민 제출 → 감정 분석 ──────────────────────
  const submitWorry = useCallback(async (userInput: string) => {
    if (!userInput.trim()) return;

    setState({
      ...INITIAL_STATE,
      phase: "analyzing",
      userInput,
    });

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput, phase: "analyze" }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "분석 실패");

      setState((prev) => ({
        ...prev,
        phase: "picking_strategy",
        emotionalState: data.emotionalState,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: err instanceof Error ? err.message : "오류가 발생했어요.",
      }));
    }
  }, []);

  // ── 2단계: 전략 선택 → 영화 추천 ──────────────────────
  const selectStrategy = useCallback(
    async (strategy: RecommendStrategy) => {
      if (!state.emotionalState) return;

      setState((prev) => ({
        ...prev,
        phase: "recommending",
        strategy,
      }));

      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userInput: state.userInput,
            emotionalState: state.emotionalState,
            strategy,
            phase: "recommend",
          }),
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "추천 실패");

        setState((prev) => ({
          ...prev,
          phase: "done",
          movies: data.movies || [],
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: err instanceof Error ? err.message : "추천 중 오류가 났어요.",
        }));
      }
    },
    [state.emotionalState, state.userInput]
  );

  // ── 전략 바꾸기 (결과 화면에서 다시 선택) ──────────────
  const changeStrategy = useCallback(
    async (strategy: RecommendStrategy) => {
      if (strategy === state.strategy) return;
      await selectStrategy(strategy);
    },
    [state.strategy, selectStrategy]
  );

  // ── 처음부터 다시 ──────────────────────────────────────
  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    submitWorry,
    selectStrategy,
    changeStrategy,
    reset,
  };
}
