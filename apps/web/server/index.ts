// apps/web/server/index.ts
import express from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "20mb" })); // 大きめの画像も許容

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// OpenAI Responses API の出力からテキストを安全に取り出すヘルパ
function extractText(r: any): string {
  return (
    r?.output_text ??
    r?.output?.[0]?.content?.[0]?.text ??
    r?.choices?.[0]?.message?.content ??
    ""
  );
}

/**
 * レシートOCR（OpenAI Vision）
 * 返り値: { items: {date,memo,amount,category?,payer?,kind?}[], raw: string }
 */
app.post("/api/ai/analyze", async (req, res) => {
  try {
    const { txns, month } = req.body as {
      txns: any[];
      month: string;
    };

    // 送るデータを絞る（不要なUI用フィールドは落とす）
    const compact = Array.isArray(txns)
      ? txns.map((t) => ({
          date: t.date,
          payer: t.payer,
          category: t.category,
          memo: t.memo,
          amount: t.amount,
          kind: t.kind,
        }))
      : [];

    const instruction =
      "あなたは家計簿のFPアナリストです。与えた月の明細から、短いJSONレポートを返してください。**JSONのみ**を返し、説明文やコードブロックは禁止。構造は次の通り：\n" +
      `{"summary":"string","insights":["string",...],"warnings":["string",...],"suggestions":["string",...]}\n` +
      "金額の単位は円、具体例や数値を交えて簡潔に。支出と収入の偏り、上位カテゴリ、継続費(サブスク)過多、外食率なども指摘。";

    const r = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instruction },
            {
              type: "input_text",
              text:
                `対象月: ${month}\n` +
                `明細(JSON):\n` +
                JSON.stringify(compact),
            },
          ],
        },
      ],
      // text.format は付けない（最新API仕様に合わせる）
    });

    // テキスト抽出（Responses APIのゆる互換）
    const out =
      (r as any)?.output_text ??
      (r as any)?.output?.[0]?.content?.[0]?.text ??
      (r as any)?.choices?.[0]?.message?.content ??
      "";

    let data: any = {};
    try {
      data = JSON.parse(String(out).trim());
    } catch {
      data = {
        summary: "解析に失敗しました。",
        insights: [],
        warnings: [],
        suggestions: [],
      };
    }

    // 型の安全化（最低限）
    const safe = {
      summary: String(data?.summary || "解析結果が見つかりませんでした。"),
      insights: Array.isArray(data?.insights) ? data.insights.map(String) : [],
      warnings: Array.isArray(data?.warnings) ? data.warnings.map(String) : [],
      suggestions: Array.isArray(data?.suggestions)
        ? data.suggestions.map(String)
        : [],
    };

    return res.json(safe);
  } catch (e: any) {
    console.error("analyze error:", e);
    return res
      .status(500)
      .json({ error: e?.message || "AI分析でエラーが発生しました。" });
  }
});


export default app;
