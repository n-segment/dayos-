// lib/emotionParser.ts
// 사용자의 고민 텍스트 → 감정 상태 구조체로 변환
// "집밥하기 싫어" → { emotions: ["번아웃", "귀찮음"], needs: ["가벼운 위로"], ... }

import Anthropic from "@anthropic-ai/sdk";

export interface EmotionalState {
  emotions: string[]; // 현재 감정 (번아웃, 불안, 외로움, 슬픔, 설렘 등)
  needs: string[]; // 지금 필요한 것 (위로, 도피, 카타르시스, 웃음, 각성 등)
  energyLevel: "very_low" | "low" | "medium" | "high"; // 집중력/에너지 수준
  preferredTone: string[]; // 원하는 톤 (따뜻한, 코미디, 잔잔한, 웅장한 등)
  avoidThemes: string[]; // 피해야 할 소재/톤
  situationContext: string; // 상황 한 줄 요약 (매칭 임베딩에 사용)
  clarifyingQuestion?: string; // 입력이 모호하면 추가 질문 (선택적)
}

const EMOTION_PARSE_PROMPT = `당신은 사용자의 고민이나 현재 상태를 분석해서 영화 추천에 필요한 감정 정보를 추출하는 전문가입니다.

사용자의 말 뒤에 숨겨진 감정 상태를 파악하세요. 표면적인 단어가 아닌 심리적 맥락을 읽어야 합니다.

예시:
- "집밥하기 싫어" → 번아웃, 귀찮음, 살짝 우울. 가벼운 위로나 도피가 필요. 에너지 낮음. 무거운 영화 피해야 함.
- "취업이 안 돼서 내가 바보같아" → 자기의심, 무력감, 좌절. 공감과 위로 필요. 에너지 낮음. 성공 스토리보다는 실패와 성장 다루는 영화.
- "일이 너무 안 풀리고 불안해" → 만성 불안, 통제감 상실. 도피나 거대한 관점 전환 필요. 에너지 낮음. 부조리 코미디나 우주적 스케일 영화.

다음 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{
  "emotions": ["감정1", "감정2"],
  "needs": ["필요1", "필요2"],
  "energyLevel": "very_low" | "low" | "medium" | "high",
  "preferredTone": ["톤1", "톤2"],
  "avoidThemes": ["피할것1", "피할것2"],
  "situationContext": "상황 한 줄 요약",
  "clarifyingQuestion": "모호할 때만 한 가지 질문, 명확하면 null"
}`;

export async function parseEmotionalState(
  userInput: string,
  apiKey: string
): Promise<EmotionalState> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `사용자 입력: "${userInput}"`,
      },
    ],
    system: EMOTION_PARSE_PROMPT,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return parsed as EmotionalState;
  } catch {
    // 파싱 실패 시 기본값 반환
    return {
      emotions: ["알 수 없음"],
      needs: ["위로"],
      energyLevel: "low",
      preferredTone: ["잔잔한"],
      avoidThemes: [],
      situationContext: userInput,
    };
  }
}

// Claude API 없을 때 키워드 기반 로컬 폴백
export function parseEmotionalStateLocal(userInput: string): EmotionalState {
  const input = userInput.toLowerCase();

  // 에너지 레벨 판단
  const lowEnergyKeywords = [
    "힘들",
    "지쳐",
    "번아웃",
    "귀찮",
    "싫",
    "모르겠",
    "눕고싶",
    "피곤",
  ];
  const highAnxietyKeywords = [
    "불안",
    "걱정",
    "무서",
    "떨려",
    "초조",
    "긴장",
  ];
  const sadKeywords = ["슬프", "우울", "외로", "쓸쓸", "힘들", "눈물", "울"];
  const angryKeywords = ["화나", "짜증", "열받", "억울", "분해"];

  const emotions: string[] = [];
  const needs: string[] = [];
  const avoidThemes: string[] = [];

  if (lowEnergyKeywords.some((k) => input.includes(k))) {
    emotions.push("번아웃");
    needs.push("가벼운 위로", "도피");
    avoidThemes.push("무겁고 진지한");
  }
  if (highAnxietyKeywords.some((k) => input.includes(k))) {
    emotions.push("불안");
    needs.push("안정감", "관점 전환");
    avoidThemes.push("스릴러", "공포");
  }
  if (sadKeywords.some((k) => input.includes(k))) {
    emotions.push("슬픔");
    needs.push("공감", "위로", "카타르시스");
  }
  if (angryKeywords.some((k) => input.includes(k))) {
    emotions.push("분노");
    needs.push("카타르시스", "통쾌함");
  }

  if (emotions.length === 0) {
    emotions.push("복잡한 감정");
    needs.push("위로");
  }

  const isLowEnergy = lowEnergyKeywords.some((k) => input.includes(k));

  return {
    emotions,
    needs,
    energyLevel: isLowEnergy ? "low" : "medium",
    preferredTone: isLowEnergy ? ["잔잔한", "따뜻한"] : ["다양한"],
    avoidThemes,
    situationContext: userInput,
  };
}
