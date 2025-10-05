// apps/web/api/ai/analyze.ts
import OpenAI from "openai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function extractOutputText(r: any): string {
  return (
    r?.output_text ??
    r?.output?.[0]?.content?.[0]?.text ??
    r?.choices?.[0]?.message?.content ??
    ""
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const { month, txns } = (req.body || {}) as {
      month?: string; // "YYYY-MM"
      txns?: Array<{
        date: string;
        memo: string;
        category: string;
        amount: number;
        kind: "expense" | "income";
      }>;
    };

    if (!month || !Array.isArray(txns)) {
      return res.status(400).json({ error: "month and txns are required" });
    }

    const sys =
      "あなたは家計アナリストです。日本語で簡潔に、数値根拠を伴うアドバイスを出してください。";

    const prompt =
      `対象月: ${month}\n` +
      `トランザクション件数: ${txns.length}\n` +
      `フォーマット（JSONのみ。説明文禁止）:\n` +
      `{"summary":"string","insights":["string",...],"warnings":["string",...],"actions":["string",...]}\n` +
      `条件:\n` +
      `- JSON以外のテキストは出力しない\n` +
      `- 金額は円整数\n` +
      `- insightsは3〜5個、actionsは実行可能な提案を3〜5個\n` +
      `- warningsは必要な時のみ\n` +
      `---\n` +
      `データ例:\n` +
      `${JSON.stringify(txns.slice(0, 200))}`;

    const r = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: [{ type: "input_text", text: sys }] },
        { role: "user", content: [{ type: "input_text", text: prompt }] },
      ],
    });

    const out = extractOutputText(r);
    let parsed: any;
    try {
      parsed = JSON.parse(String(out).trim());
    } catch {
      parsed = {
        summary: "AI出力の解析に失敗しました。",
        insights: [],
        warnings: [],
        actions: [],
      };
    }

    res.status(200).json(parsed);
  } catch (e: any) {
    console.error("analyze error:", e);
    res.status(500).json({ error: e?.message || "OpenAI error" });
  }
}
