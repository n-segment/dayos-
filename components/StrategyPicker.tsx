"use client";

// components/StrategyPicker.tsx
// 고민 입력 후 추천 전략을 선택하는 컴포넌트
// 공감형: 나 같은 상황의 주인공 → 위로와 공감
// 전환형: 완전히 다른 세계로 도피 → 현실 탈출

import { useState } from "react";
import type { EmotionalState } from "@/lib/emotionParser";

export type RecommendStrategy = "empathy" | "escape";

interface StrategyPickerProps {
  userInput: string;
  emotionalState: EmotionalState;
  onStrategySelect: (strategy: RecommendStrategy) => void;
  isLoading?: boolean;
}

const STRATEGY_OPTIONS: Array<{
  id: RecommendStrategy;
  emoji: string;
  label: string;
  sublabel: string;
  description: string;
  example: string;
}> = [
  {
    id: "empathy",
    emoji: "🤝",
    label: "공감형",
    sublabel: "나 같은 상황의 주인공",
    description: "나랑 비슷한 상황에서 버티고 있는 캐릭터를 보고 싶어요.",
    example: "\"나만 이런 거 아니구나\" 싶은 영화",
  },
  {
    id: "escape",
    emoji: "🌪️",
    label: "전환형",
    sublabel: "완전히 다른 세계로 도피",
    description: "지금 이 현실을 잠깐 완전히 잊고 싶어요.",
    example: "지금 내 상황과 아무 관련 없는 영화",
  },
];

export default function StrategyPicker({
  userInput,
  emotionalState,
  onStrategySelect,
  isLoading = false,
}: StrategyPickerProps) {
  const [selected, setSelected] = useState<RecommendStrategy | null>(null);

  const handleSelect = (strategy: RecommendStrategy) => {
    if (isLoading) return;
    setSelected(strategy);
    onStrategySelect(strategy);
  };

  return (
    <div className="strategy-picker">
      {/* 감정 분석 결과 요약 */}
      <div className="emotion-summary">
        <p className="emotion-context">{emotionalState.situationContext}</p>
        <div className="emotion-tags">
          {emotionalState.emotions.slice(0, 3).map((e) => (
            <span key={e} className="emotion-tag">
              {e}
            </span>
          ))}
        </div>
      </div>

      {/* 전략 선택 질문 */}
      <p className="strategy-question">지금 어떤 영화가 보고 싶어요?</p>

      {/* 선택 버튼 */}
      <div className="strategy-options">
        {STRATEGY_OPTIONS.map((option) => (
          <button
            key={option.id}
            onClick={() => handleSelect(option.id)}
            disabled={isLoading}
            className={`strategy-btn ${selected === option.id ? "selected" : ""} ${isLoading && selected === option.id ? "loading" : ""}`}
            aria-pressed={selected === option.id}
          >
            <span className="strategy-emoji">{option.emoji}</span>
            <div className="strategy-text">
              <span className="strategy-label">
                {option.label}
                <span className="strategy-sublabel">{option.sublabel}</span>
              </span>
              <span className="strategy-desc">{option.description}</span>
              <span className="strategy-example">{option.example}</span>
            </div>
            {selected === option.id && isLoading && (
              <span className="strategy-spinner" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>

      <style jsx>{`
        .strategy-picker {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding: 1.5rem;
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .emotion-summary {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .emotion-context {
          font-size: 0.9rem;
          color: var(--text-secondary, #888);
          font-style: italic;
          line-height: 1.5;
        }

        .emotion-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }

        .emotion-tag {
          font-size: 0.75rem;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: var(--tag-bg, rgba(139, 115, 255, 0.12));
          color: var(--tag-color, #8b73ff);
          border: 1px solid var(--tag-border, rgba(139, 115, 255, 0.25));
        }

        .strategy-question {
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--text-primary, #1a1a2e);
          margin: 0;
        }

        .strategy-options {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        @media (min-width: 560px) {
          .strategy-options {
            flex-direction: row;
          }
        }

        .strategy-btn {
          flex: 1;
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.2rem 1.2rem;
          border-radius: 16px;
          border: 1.5px solid var(--border, rgba(0, 0, 0, 0.08));
          background: var(--card-bg, #fff);
          cursor: pointer;
          text-align: left;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .strategy-btn:hover:not(:disabled) {
          border-color: var(--accent, #8b73ff);
          background: var(--card-hover, rgba(139, 115, 255, 0.04));
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(139, 115, 255, 0.12);
        }

        .strategy-btn.selected {
          border-color: var(--accent, #8b73ff);
          background: var(--card-selected, rgba(139, 115, 255, 0.08));
        }

        .strategy-btn:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .strategy-emoji {
          font-size: 1.8rem;
          flex-shrink: 0;
          line-height: 1;
          margin-top: 0.1rem;
        }

        .strategy-text {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .strategy-label {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary, #1a1a2e);
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }

        .strategy-sublabel {
          font-size: 0.78rem;
          font-weight: 500;
          color: var(--accent, #8b73ff);
        }

        .strategy-desc {
          font-size: 0.82rem;
          color: var(--text-secondary, #666);
          line-height: 1.4;
        }

        .strategy-example {
          font-size: 0.75rem;
          color: var(--text-tertiary, #999);
          font-style: italic;
        }

        .strategy-spinner {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          width: 16px;
          height: 16px;
          border: 2px solid var(--accent, #8b73ff);
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
