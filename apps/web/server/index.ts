// apps/web/server/index.ts
import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();
app.use(bodyParser.json({ limit: "20mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 安全に output_text を取り出すヘルパ
function extractText(r: any): string {
    return (
        r?.output_text ??
        r?.output?.[0]?.content?.[0]?.text ??
        r?.choices?.[0]?.message?.content ??
        ""
    );
}

// --------- ① AIアドバイス（JSONで返す） ---------
app.post("/api/ai/analyze", async (req, res) => {
    try {
        const { month, txns } = req.body as {
            month: string;
            txns: Array<{
                date: string;
                payer: string;
                category: string;
                memo: string;
                amount: number;
                kind: "income" | "expense";
            }>;
        };

        const r = await openai.responses.create({
            model: "gpt-4o-mini",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text:
                                `あなたは家計アドバイザーです。以下のデータを分析し、**厳密に JSON だけ** を返してください。\n` +
                                `JSON 形式:\n` +
                                `{\n` +
                                `  "summary": "string",\n` +
                                `  "keyInsights": ["string", ...],\n` +
                                `  "advice": ["string", ...],\n` +
                                `  "warnings": ["string", ...]\n` +
                                `}\n` +
                                `必ず上記キーのみを含め、追加のテキストや説明を含めないでください。\n\n` +
                                `対象月: ${month}\n` +
                                `データ(JSON): ${JSON.stringify(txns).slice(0, 80000)}`
                        }
                    ],
                },
            ],
            // ← スキーマは使わず、JSON 出力を強制
            //   text: { format: "json" },
        });

        const out = extractText(r);
        const safe = (out && out.trim()) ? out : JSON.stringify({
            summary: `${month} の家計サマリー（暫定）`,
            keyInsights: ["十分なデータがないため暫定結果を表示しています。"],
            advice: ["レシートを数枚取り込んでから再実行してください。"],
            warnings: [],
        });

        const obj = JSON.parse(safe);
        return res.json({ json: obj });
    } catch (e: any) {
        console.error("analyze error:", e);
        return res.status(500).json({ error: e?.message || "OpenAI error" });
    }
});

// --------- ② Vision OCR（JSONで返す → フロントで自動登録） ---------
app.post("/api/ai/receipt", async (req, res) => {
    try {
        const { imageDataUrl } = req.body as { imageDataUrl: string };
        if (!imageDataUrl) {
            return res.status(400).json({ error: "imageDataUrl is required" });
        }

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
                                "以下の画像から明細を抽出し、**JSONだけ**を返してください（説明文禁止）。\n" +
                                '形式: {"items":[{"date":"YYYY-MM-DD(可能なら)","memo":"string","amount":1234,"category":"string(任意)","payer":"string(任意)"}]}',
                        },
                        {
                            type: "input_image",
                            image_url: imageDataUrl,
                        },
                    ],
                } as any, // ← これで型エラーを無視
            ],
        });

        const out =
            extractText(r) || ""; // 既存のヘルパーをそのまま利用
        const safe = out.trim() || `{"items":[]}`;

        let parsed: any;
        try {
            parsed = JSON.parse(safe);
        } catch {
            parsed = { items: [] };
        }

        const today = new Date().toISOString().slice(0, 10);
        const items = (parsed.items || [])
            .map((it: any) => {
                const amount = Number(it?.amount) || 0;
                const memo = String(it?.memo || "").trim();
                if (amount <= 0 || !memo) return null;
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

        return res.json({ items });
    } catch (e: any) {
        console.error("receipt error:", e);
        return res.status(500).json({ error: e?.message || "OpenAI error" });
    }
});

export default app;
