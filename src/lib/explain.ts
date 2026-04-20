import type { ExplanationResult, VerseItem } from "@/lib/types";

function fallbackExplanation(verses: VerseItem[]): ExplanationResult {
  return {
    keyPoints: [
      "These verses call for conscious faith, disciplined worship, and ethical action.",
      "Guidance in the Quran is practical: belief should shape behavior and priorities.",
      "The passage warns against self-deception and spiritual inconsistency.",
      "Small daily reflection can prevent drift and strengthen inner clarity.",
    ],
    simpleSummary:
      "This passage emphasizes sincere belief, consistent worship, and honest self-accountability. Think of faith here like the foundational architecture of a system—if the core is strong and sincere, the entire implementation (your daily actions) will be robust and reliable.",
    reflectionPrompts: [
      "What one decision today can better align with these verses?",
      "Where do I need more sincerity between what I say and what I actually do?",
    ],
    disclaimer:
      "AI-assisted explanation only. It is not a fatwa and does not replace qualified scholars.",
  };
}

export async function generateExplanation(
  verses: VerseItem[],
): Promise<ExplanationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  if (!apiKey) {
    return fallbackExplanation(verses);
  }

  try {
    const verseText = verses
      .map((verse) => `${verse.key} | ${verse.arabic} | ${verse.translation}`)
      .join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You explain Quran verses for busy professionals (developers, founders, executives) in plain, respectful, modern language. Avoid legal rulings or fatwas. Synthesize the meaning into a cohesive paragraph for 'simpleSummary' rather than just translating word-for-word. Crucially, include 1-2 professional or developer-style analogies (e.g., comparing 'Taqwa' to an error-handling system, or 'Sabr' to a long-term investment strategy) to make it memorable. Keep output concise, practical, spiritually grounded, and free of sectarian claims. Write your response in the SAME LANGUAGE as the translated verses provided by the user.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Use these verses and return JSON with keyPoints, simpleSummary, reflectionPrompts. Verses:\n" +
                  verseText,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              keyPoints: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
              simpleSummary: {
                type: "STRING",
              },
              reflectionPrompts: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
            },
            required: ["keyPoints", "simpleSummary", "reflectionPrompts"],
          },
        },
      }),
    },
    );

    if (!response.ok) {
      return fallbackExplanation(verses);
    }

    const payload = await response.json();
    const contentString =
      payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;

    if (!contentString) {
      return fallbackExplanation(verses);
    }

    const parsed = JSON.parse(contentString) as Omit<
      ExplanationResult,
      "disclaimer"
    >;

    return {
      ...parsed,
      disclaimer:
        "AI-assisted explanation only. It is not a fatwa and does not replace qualified scholars.",
    };
  } catch {
    return fallbackExplanation(verses);
  }
}
