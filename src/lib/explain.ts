import type { ExplanationResult, VerseItem } from "@/lib/types";

function fallbackExplanation(verses: VerseItem[]): ExplanationResult {
  const combined = verses.map((verse) => verse.translation).join(" ");
  const highlight = combined.split(".").slice(0, 2).join(". ").trim();

  return {
    keyPoints: [
      "These verses call for conscious faith, disciplined worship, and ethical action.",
      "Guidance in the Quran is practical: belief should shape behavior and priorities.",
      "The passage warns against self-deception and spiritual inconsistency.",
      "Small daily reflection can prevent drift and strengthen inner clarity.",
    ],
    simpleSummary:
      highlight ||
      "This passage emphasizes sincere belief, consistent worship, and honest self-accountability.",
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
              text: "You explain Quran verses for busy professionals in plain, respectful language. Avoid legal rulings. Keep output concise, practical, spiritually grounded, and free of sectarian claims.",
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
