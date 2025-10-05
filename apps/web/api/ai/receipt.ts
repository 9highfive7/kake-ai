// apps/web/api/ai/receipt.ts
import OpenAI from "openai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// OpenAIのレスポンスからテキストを取り出す汎用ヘルパ
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
    const { imageDataUrl } = (req.body || {}) as { imageDataUrl?: string };
    if (!imageDataUrl) return res.status(400).json({ error: "imageDataUrl is required" });

    const r = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions:
        "日本のレシート画像から商品行のみを抽出してください。割引・税・合計は除外。金額は円の整数。",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "以下の画像から明細を抽出し、**JSONだけ** を返してください（説明文禁止）。\n" +
                "形式: {\"items\":[{\"date\":\"YYYY-MM-DD(可能なら)\",\"memo\":\"string\",\"amount\":1234,\"category\":\"string(任意)\",\"payer\":\"string(任意)\"}]}\n" +
                "dateが不明なら空で良いです。",
            },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
    });

    const out = extractOutputText(r);
    let parsed: any;
    try {
      parsed = JSON.parse(String(out).trim());
    } catch {
      parsed = { items: [] };
    }

    const today = new Date().toISOString().slice(0, 10);
    const items = (parsed.items || [])
      .map((it: any) => {
        const memo = String(it?.memo || "").trim();
        const amount = Number(String(it?.amount ?? "").replace(/[^\d.-]/g, "")) || 0;
        if (!memo || amount <= 0) return null;
        const date =
          typeof it?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.date)
            ? it.date
            : today;
        return {
          date,
          memo,
          amount,
          category: String(it?.category || ""),
          payer: String(it?.payer || ""),
          kind: "expense" as const,
        };
      })
      .filter(Boolean);

    res.status(200).json({ items, raw: out });
  } catch (e: any) {
    console.error("receipt error:", e);
    res.status(500).json({ error: e?.message || "OpenAI error" });
  }
}
