import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// ★ Cell を忘れずに import！
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Legend, Cell,
  ComposedChart, Line, CartesianGrid
} from "recharts";
import { Upload, Trash2, Plus, Wand2, Edit3, FileDown, RefreshCw, Sparkles, Camera } from "lucide-react";

const CHART_COLORS = [
  "#4E79A7", // blue
  "#F28E2B", // orange
  "#E15759", // red
  "#76B7B2", // teal
  "#59A14F", // green
  "#EDC949", // yellow
  "#AF7AA1", // purple
  "#FF9DA7", // pink
  "#9C755F", // brown
  "#BAB0AC", // gray
];
// 収入/支出の定番カラー
const INCOME_COLOR = "#2E7D32"; // 深いグリーン
const EXPENSE_COLOR = "#D32F2F"; // 深いレッド
const NET_POS_COLOR = "#1E88E5"; // 黒字の差額カラー
const NET_NEG_COLOR = "#EF6C00"; // 赤字の差額カラー

// ====== 型 ======
type Kind = "expense" | "income";
type Txn = {
  id: string;
  date: string;            // YYYY-MM-DD
  payer: "まや" | "かずみ" | "共同";
  category: string;
  memo: string;
  amount: number;          // JPY
  kind: Kind;              // 収支
};

const DEFAULT_CATEGORIES = [
  "食費", "日用品", "外食", "住居", "水道光熱", "通信", "交通", "医療", "趣味・娯楽", "美容・衣服", "交際費", "教育", "サブスク", "特別費", "その他",
];

// ====== ユーティリティ ======
const prettyJPY = (n: number) =>
  n.toLocaleString("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

const randomId = () => Math.random().toString(36).slice(2, 10);

// 重複キー（半角空白正規化）
const dupKey = (t: Pick<Txn, "date" | "memo" | "amount" | "kind">) =>
  `${t.date}|${t.memo.replace(/\s+/g, " ").trim()}|${t.amount}|${t.kind}`;

// ====== Demo: ルールベースのアドバイス ======
function heuristicAdvice(txns: Txn[], month: string) {
  const same = txns.filter((t) => t.date.slice(0, 7) === month && t.kind === "expense");
  const total = same.reduce((s, t) => s + t.amount, 0);
  const byCat: Record<string, number> = {};
  for (const t of same) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const tips: string[] = [];
  if ((byCat["外食"] || 0) > 0.3 * total) tips.push("外食が支出の30%超。週1回は自炊デーを設定して1万円/月の節約を。");
  if ((byCat["サブスク"] || 0) >= 2000) tips.push("サブスクが月2000円以上。直近3ヶ月で使っていないサービスは一旦解約候補に。");
  if (same.length === 0) tips.push("まだデータが少ないです。レシートを2〜3枚取り込むと傾向が見えてきます。");
  return {
    summary: `${month} の支出は ${prettyJPY(total)}。上位カテゴリは ${top.map(([c]) => c).join("・") || "なし"}。`,
    bullets: tips,
  };
}

// ====== OCR: OpenAI を使う（/api/ai/receipt） ======
async function callVisionOCRViaServer(
  imageFile: File
): Promise<{ txns: Txn[]; raw: string }> {
  // 画像 → dataURL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(imageFile);
  });

  // --- サーバ呼び出し ---
  const r = await fetch("/api/ai/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: dataUrl }),
  });

  // 一度だけ読み取る
  const txt = await r.text();

  if (!r.ok) {
    let msg = txt;
    try {
      const j = JSON.parse(txt);
      msg = j?.error ?? msg;
    } catch { }
    throw new Error(msg || `HTTP ${r.status}`);
  }

  const payload = JSON.parse(txt) as {
    items: Array<Partial<Txn>>;
    raw?: string;
  };

  const today = new Date().toISOString().slice(0, 10);
  const txns: Txn[] = (payload.items || [])
    .map((i) => {
      const memo = (i.memo || "").toString().trim() || "レシート項目";
      const amtStr =
        typeof i.amount === "string" ? i.amount : String(i.amount ?? "");
      const amount = Number(amtStr.replace(/[^\d.-]/g, "")) || 0;
      return {
        id: randomId(),
        date: i.date || today,
        payer: (i.payer as any) || "共同",
        category: i.category || "食費",
        memo,
        amount,
        kind: (i.kind as Kind) || "expense",
      };
    })
    .filter((t) => t.amount > 0);

  return { txns, raw: payload.raw || "" };
}

// ====== メインコンポーネント ======
export default function App() {
  const [txns, setTxns] = useLocalStorage<Txn[]>("kakeibo.txns", []);
  const [filterMonth, setFilterMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrLog, setOcrLog] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOut, setAiOut] = useState<{
    summary: string;
    insights: string[];
    warnings: string[];
    suggestions: string[];
  } | null>(null);
  const [aiLog, setAiLog] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useLocalStorage<number>("kakeibo.budget", 150000);


  async function runAIAnalysis() {
    try {
      setAiBusy(true);
      setAiLog("AIに送信中…");

      // その月に限定しても良いし、全件でもOK。ここでは全件を渡して月だけ指定
      const r = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: filterMonth, txns }),
      });

      const txt = await r.text();
      if (!r.ok) {
        let msg = txt;
        try {
          msg = JSON.parse(txt)?.error ?? msg;
        } catch { }
        throw new Error(msg || `HTTP ${r.status}`);
      }

      const data = JSON.parse(txt);
      setAiOut(data);
      setAiLog("完了");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      alert(`AI分析でエラー: ${msg}`);
      setAiLog(`エラー: ${msg}`);
    } finally {
      setAiBusy(false);
    }
  }


  // 月別集計
  const byMonth = useMemo(() => {
    const m: Record<string, Txn[]> = {};
    for (const t of txns) {
      const k = t.date.slice(0, 7);
      (m[k] ||= []).push(t);
    }
    return m;
  }, [txns]);

  const months = useMemo(() => Object.keys(byMonth).sort().reverse(), [byMonth]);
  const visible = byMonth[filterMonth] || [];

  const categories = useMemo(() => {
    const s = new Set(DEFAULT_CATEGORIES);
    txns.forEach(t => s.add(t.category));
    return Array.from(s);
  }, [txns]);

  // グラフ用
  const categoryAgg = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const t of visible.filter(v => v.kind === "expense")) {
      agg[t.category] = (agg[t.category] || 0) + t.amount;
    }
    return Object.entries(agg).map(([name, value]) => ({ name, value }));
  }, [visible]);

  const monthAgg = useMemo(() => {
    return months.map((m) => ({
      month: m,
      total: (byMonth[m] || [])
        .filter(t => t.kind === "expense")
        .reduce((s, t) => s + t.amount, 0)
    }));
  }, [months, byMonth]);

  // 収支の合計
  const incomeTotal = visible.filter(t => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const expenseTotal = visible.filter(t => t.kind === "expense").reduce((s, t) => s + t.amount, 0);

  // 月別の収入/支出まとめ（棒グラフ用）
  const monthAggIncome = useMemo(() => {
    return months.map((m) => ({
      month: m,
      income: (byMonth[m] || [])
        .filter((t) => t.kind === "income")
        .reduce((s, t) => s + t.amount, 0),
    }));
  }, [months, byMonth]);

  const monthAggExpense = useMemo(() => {
    return months.map((m) => ({
      month: m,
      expense: (byMonth[m] || [])
        .filter((t) => t.kind === "expense")
        .reduce((s, t) => s + t.amount, 0),
    }));
  }, [months, byMonth]);

  // 直近6ヶ月分のスタックデータ（見やすさ重視）
  const monthStacked = useMemo(() => {
    const map: Record<string, { month: string; income: number; expense: number }> = {};
    monthAggIncome.forEach((r) => (map[r.month] = { month: r.month, income: r.income, expense: 0 }));
    monthAggExpense.forEach((r) => {
      map[r.month] ??= { month: r.month, income: 0, expense: 0 };
      map[r.month].expense = r.expense;
    });
    // 古い→新しい で並べ、最後の6件に絞る
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }, [monthAggIncome, monthAggExpense]);

  // 今月の差額
  const netThisMonth = incomeTotal - expenseTotal;

  const progressData = useMemo(() => {
    // 対象月（YYYY-MM）→ 月初 Date
    const year = Number(filterMonth.slice(0, 4));
    const month = Number(filterMonth.slice(5, 7)) - 1; // 0-index
    if (Number.isNaN(year) || Number.isNaN(month)) return [];

    // 月の日数
    const lastDay = new Date(year, month + 1, 0).getDate();

    // 日別集計用マップ
    const expenseByDay: Record<string, number> = {};
    const incomeByDay: Record<string, number> = {};

    for (const t of visible) {
      const d = Number(t.date.slice(8, 10)); // 1..31
      if (!Number.isFinite(d)) continue;
      if (t.kind === "expense") {
        expenseByDay[d] = (expenseByDay[d] || 0) + t.amount;
      } else if (t.kind === "income") {
        incomeByDay[d] = (incomeByDay[d] || 0) + t.amount;
      }
    }

    const perDayBudget = monthlyBudget / Math.max(1, lastDay);
    const rows: Array<{
      day: string;
      expense: number;
      income: number;
      cumExpense: number;
      cumIncome: number;
      cumBudget: number;
    }> = [];

    let cumE = 0;
    let cumI = 0;
    let cumB = 0;

    for (let d = 1; d <= lastDay; d++) {
      const e = expenseByDay[d] || 0;
      const i = incomeByDay[d] || 0;
      cumE += e;
      cumI += i;
      cumB += perDayBudget;
      rows.push({
        day: String(d).padStart(2, "0"),
        expense: e,
        income: i,
        cumExpense: cumE,
        cumIncome: cumI,
        cumBudget: cumB,
      });
    }
    return rows;
  }, [visible, filterMonth, monthlyBudget]);



  // ====== 重複検出→確認→登録 ======
  function addImportedWithDupPrompt(imported: Txn[]) {
    if (!imported.length) {
      alert("追加できる新規明細はありませんでした（空の結果）。");
      return;
    }
    const existingKeys = new Set(txns.map((t) => dupKey(t)));
    const dups = imported.filter((i) => existingKeys.has(dupKey(i)));
    const news = imported.filter((i) => !existingKeys.has(dupKey(i)));

    if (news.length === 0 && dups.length > 0) {
      const ok = window.confirm("既に取り込み済のレシートのようですが、記録しますか？");
      if (!ok) return;
      const forced = [...txns, ...dups.map(d => ({ ...d, id: randomId() }))];
      setTxns(forced);
      alert(`${dups.length}件を再登録しました。`);
      return;
    }

    if (news.length > 0) {
      setTxns((prev) => [...news, ...prev]);
      const msg = dups.length
        ? `${news.length}件を追加しました（重複 ${dups.length}件はスキップ）。`
        : `${news.length}件を追加しました。`;
      alert(msg);
    } else {
      alert("追加できる新規明細はありませんでした（重複の可能性）。");
    }
  }

  // ====== OCR ハンドラ ======
  async function handleOpenAIOcr(file: File) {
    setOcrBusy(true);
    setOcrLog("OpenAI Vision に送信中…");
    try {
      const { txns, raw } = await callVisionOCRViaServer(file);
      setOcrLog(`RAW:\n${(raw || "").slice(0, 1000)}`);
      addImportedWithDupPrompt(txns);
      if (txns.length) setFilterMonth(txns[0].date.slice(0, 7));
      if (!txns.length) alert("追加できる新規明細はありませんでした（空の結果）。");
    } catch (e: any) {
      const msg =
        e?.message ??
        (typeof e === "string" ? e : JSON.stringify(e ?? {}));
      console.error("OCR client error:", e);
      alert(`OpenAI OCRでエラー: ${msg}`);
      setOcrLog(`OpenAI OCRでエラー: ${msg}`);
    } finally {
      setOcrBusy(false);
    }
  }

  // CSV 書き出し
  function exportCSV() {
    const header = ["id", "date", "payer", "category", "memo", "amount", "kind"].join(",");
    const rows = txns.map(t => [t.id, t.date, t.payer, t.category, (String(t.memo) || "").split(",").join(" "), t.amount, t.kind].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kakeibo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 手入力用の状態
  const [newItem, setNewItem] = useState<Partial<Txn>>({
    date: new Date().toISOString().slice(0, 10),
    payer: "共同",
    category: "食費",
    kind: "expense",
  });
  const [editId, setEditId] = useState<string | null>(null);

  function addTxn() {
    if (!newItem.date || !newItem.category || newItem.amount == null || !newItem.kind) return;
    const t: Txn = {
      id: randomId(),
      date: newItem.date!,
      payer: (newItem.payer as any) || "共同",
      category: newItem.category!,
      memo: newItem.memo || "",
      amount: Number(newItem.amount),
      kind: newItem.kind as Kind,
    };
    const key = dupKey(t);
    const exists = new Set(txns.map(dupKey)).has(key);
    if (exists) {
      const ok = window.confirm("既に同一の明細があるようです。登録しますか？");
      if (!ok) return;
    }
    setTxns((prev) => [t, ...prev]);
    setNewItem({ date: new Date().toISOString().slice(0, 10), payer: "共同", category: t.category, kind: t.kind });
  }

  function removeTxn(id: string) {
    setTxns((prev) => prev.filter((t) => t.id !== id));
  }
  function startEdit(t: Txn) {
    setEditId(t.id);
    setNewItem({ ...t });
  }
  function saveEdit() {
    if (!editId) return;
    const updated = { ...(newItem as Txn), id: editId };
    setTxns((prev) => prev.map((t) => (t.id === editId ? updated : t)));
    setEditId(null);
    setNewItem({ date: new Date().toISOString().slice(0, 10), payer: "共同", category: "食費", kind: "expense" });
  }
  function resetAll() {
    if (confirm("すべてのデータを削除します。よろしいですか？")) setTxns([]);
  }

  const advice = heuristicAdvice(txns, filterMonth);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">同棲家計簿（デモ）</h1>
          <header className="mb-6 flex items-center justify-between">

            <div className="flex gap-2">
              {/* クイックスタート（ダイアログをここに内包） */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Sparkles className="mr-2 h-4 w-4" />
                    クイックスタートを見る
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>このデモの使い方</DialogTitle>
                  </DialogHeader>

                  <ol className="list-decimal pl-6 space-y-2 text-sm">
                    <li>「追加/レシートOCR」でレシート画像をアップロード → OpenAIでOCR。</li>
                    <li>認識ミスは「明細一覧」から編集。手入力追加もOK。</li>
                    <li>「ダッシュボード」で月の合計、カテゴリ内訳、月別推移を確認。</li>
                    <li>「AI分析」でAIの自動レポートを取得。</li>
                    <li>「CSVエクスポート」でバックアップ。ローカル保存はlocalStorageです。</li>
                  </ol>

                  <p className="mt-2 text-xs text-slate-500">
                    ※ 本番化時はユーザー/世帯ごとのクラウド保存・レシートテンプレ適応・検索とタグ付け・割り勘精算・共有リンクなどを追加してください。
                  </p>
                </DialogContent>
              </Dialog>


              {/* CSV */}
              <Button variant="outline" onClick={exportCSV}>
                <FileDown className="mr-2 h-4 w-4" />
                CSVエクスポート
              </Button>


              {/* 全消去 */}
              <Button variant="destructive" onClick={resetAll}>
                <Trash2 className="mr-2 h-4 w-4" />
                全消去
              </Button>
            </div>
          </header>

        </header>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList>
            <TabsTrigger value="dashboard">ダッシュボード</TabsTrigger>
            <TabsTrigger value="analysis">分析</TabsTrigger>
            <TabsTrigger value="add">追加/レシートOCR</TabsTrigger>
            <TabsTrigger value="list">明細一覧</TabsTrigger>
            <TabsTrigger value="ai">AI分析</TabsTrigger>
          </TabsList>

          {/* Dashboard */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* 収入・支出・差額・ハイライト の4カード */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 今月の収入 */}
              <Card className="border-l-4" style={{ borderColor: INCOME_COLOR }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">今月の収入</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" style={{ color: INCOME_COLOR }}>
                    {prettyJPY(incomeTotal)}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Label className="w-20">対象月</Label>
                    <Input
                      type="month"
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="max-w-[180px]"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* 今月の支出 */}
              <Card className="border-l-4" style={{ borderColor: EXPENSE_COLOR }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">今月の支出</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" style={{ color: EXPENSE_COLOR }}>
                    {prettyJPY(expenseTotal)}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">固定費・変動費を含む合計</div>
                </CardContent>
              </Card>

              {/* 今月の差額（天気表現つき） */}
              <Card
                className="border-l-4"
                style={{ borderColor: netThisMonth >= 0 ? NET_POS_COLOR : NET_NEG_COLOR }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">今月の差額</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="flex items-center justify-between"
                    style={{ color: netThisMonth >= 0 ? NET_POS_COLOR : NET_NEG_COLOR }}
                  >
                    <div className="text-3xl font-bold">{prettyJPY(netThisMonth)}</div>
                    <div className="text-4xl">
                      {(() => {
                        if (netThisMonth >= 30000) return "☀️";    // 快晴（黒字3万以上）
                        if (netThisMonth >= 0) return "🌤️";        // 曇り（0〜+3万）
                        if (netThisMonth >= -30000) return "🌧️";   // 雨（0〜-3万）
                        return "⛈️";                                // 雷雨（-3万超）
                      })()}
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${netThisMonth >= 0 ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                      }`}>
                      {netThisMonth >= 0 ? "黒字" : "赤字"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 今月のハイライト（簡易アドバイス） */}
            <Card>
              <CardHeader><CardTitle>今月のハイライト</CardTitle></CardHeader>
              <CardContent>
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>サマリー</AlertTitle>
                  <AlertDescription>{advice.summary}</AlertDescription>
                </Alert>
                <ul className="mt-4 list-disc pl-6 text-sm text-slate-700 space-y-2">
                  {advice.bullets.map((b, i) => (<li key={i}>{b}</li>))}
                  {advice.bullets.length === 0 && <li>支出は良好なバランス。この調子！</li>}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            {/* 上段2つ：今月の収入 vs 支出、カテゴリ別（支出） */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 今月の収入 vs 支出 */}
              <Card>
                <CardHeader><CardTitle>今月の収入 vs 支出</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "収入", value: incomeTotal },
                          { name: "支出", value: expenseTotal },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={100}
                        label
                      >
                        <Cell fill={INCOME_COLOR} />
                        <Cell fill={EXPENSE_COLOR} />
                      </Pie>
                      <Tooltip formatter={(v: any) => prettyJPY(Number(v))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* カテゴリ別（支出） */}
              <Card>
                <CardHeader><CardTitle>カテゴリ別（支出）</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      {Array.isArray(categoryAgg) && categoryAgg.length > 0 ? (
                        <Pie
                          data={categoryAgg}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={110}
                          label
                        >
                          {categoryAgg.map((_, i) => (
                            <Cell
                              key={`cell-${i}`}
                              fill={
                                // 緑 (#4E79A7) と赤 (#E15759) 系はスキップして他の色を優先
                                CHART_COLORS.filter(
                                  (c) => c !== "#59A14F" && c !== "#E15759"
                                )[i % (CHART_COLORS.length - 2)]
                              }
                            />
                          ))}
                        </Pie>
                      ) : (
                        <text
                          x="50%"
                          y="50%"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          style={{ fontSize: "0.9rem", fill: "#888" }}
                        >
                          データがありません
                        </text>
                      )}
                      <Tooltip formatter={(v: any) => prettyJPY(Number(v))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* 下段：直近6ヶ月の収支推移（スタック棒） */}
            <Card>
              <CardHeader><CardTitle>直近6ヶ月の収支推移</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthStacked}>
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => prettyJPY(Number(v))} />
                    <Legend />
                    <Bar dataKey="income" name="収入" stackId="a" fill={INCOME_COLOR} />
                    <Bar dataKey="expense" name="支出" stackId="a" fill={EXPENSE_COLOR} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>


            {/* 進捗グラフ（棒＋折れ線） */}
            <Card>
              <CardHeader>
                <CardTitle>今月の進捗（支出）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="text-sm w-28">今月の予算</Label>
                  <Input
                    type="number"
                    className="max-w-[160px]"
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(Number(e.target.value || 0))}
                  />
                  <span className="text-sm text-slate-500">
                    1日あたり目安: {prettyJPY(Math.round(monthlyBudget / Math.max(1, progressData.length || 1)))}
                  </span>
                </div>

                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={progressData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip
                        formatter={(v: any, name: string) => {
                          if (name.includes("支出") || name.toLowerCase().includes("budget")) {
                            return prettyJPY(Number(v));
                          }
                          return v;
                        }}
                        labelFormatter={(label) => `${filterMonth}-${label}`}
                      />
                      <Legend />
                      <Bar dataKey="expense" name="当日支出" fill={EXPENSE_COLOR} />
                      <Line type="monotone" dataKey="cumExpense" name="累計支出" stroke={EXPENSE_COLOR} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="cumBudget" name="累計予算" stroke={NET_POS_COLOR} strokeDasharray="6 4" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          {/* Add / OCR */}
          <TabsContent value="add" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>レシート画像を取り込む</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  {/* 隠し input: 画像ファイル */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) await handleOpenAIOcr(f);
                      e.currentTarget.value = ""; // 同じファイル連続選択のためクリア
                    }}
                  />
                  <Button type="button" variant="default" disabled={ocrBusy}
                    onClick={() => fileRef.current?.click()}>
                    画像を選択（OpenAI）
                  </Button>

                  {/* 隠し input: カメラ撮影 */}
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) await handleOpenAIOcr(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" disabled={ocrBusy}
                    onClick={() => cameraRef.current?.click()}>
                    写真を撮る（OpenAI）
                  </Button>

                  {ocrBusy && (
                    <Button variant="outline" disabled>OCR中…</Button>
                  )}
                </div>

                <Textarea className="mt-3 h-24" value={ocrLog} readOnly placeholder="OCRの進捗・結果が表示されます" />
                <p className="mt-2 text-xs text-slate-500">
                  ※ ブラウザ→サーバ→OpenAIでOCRします。文字密度が高い/傾きが大きい画像は精度が落ちる場合があります。
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>手入力で追加</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-2">
                  <Label>日付</Label>
                  <Input type="date" value={newItem.date || ""} onChange={(e) => setNewItem((s) => ({ ...s, date: e.target.value }))} />
                </div>
                <div>
                  <Label>支払者</Label>
                  <Select value={newItem.payer as any} onValueChange={(v) => setNewItem((s) => ({ ...s, payer: v as any }))}>
                    <SelectTrigger><SelectValue placeholder="共同" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="共同">共同</SelectItem>
                      <SelectItem value="まや">まや</SelectItem>
                      <SelectItem value="かずみ">かずみ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>カテゴリ</Label>
                  <Select value={newItem.category as any} onValueChange={(v) => setNewItem((s) => ({ ...s, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>メモ</Label>
                  <Input value={newItem.memo || ""} onChange={(e) => setNewItem((s) => ({ ...s, memo: e.target.value }))} placeholder="例：牛乳 2本" />
                </div>

                <div>
                  <Label>金額</Label>
                  <Input type="number" value={(newItem.amount as any) || ""} onChange={(e) => setNewItem((s) => ({ ...s, amount: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>収支</Label>
                  <Select value={newItem.kind as any} onValueChange={(v) => setNewItem((s) => ({ ...s, kind: v as Kind }))}>
                    <SelectTrigger><SelectValue placeholder="支出/収入" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">支出</SelectItem>
                      <SelectItem value="income">収入</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-6 flex justify-end">
                  {editId ? (
                    <div className="flex gap-2">
                      <Button onClick={saveEdit}><Edit3 className="mr-2 h-4 w-4" />保存</Button>
                      <Button variant="outline" onClick={() => { setEditId(null); setNewItem({ date: new Date().toISOString().slice(0, 10), payer: "共同", category: "食費", kind: "expense" }); }}>キャンセル</Button>
                    </div>
                  ) : (
                    <Button onClick={addTxn}><Plus className="mr-2 h-4 w-4" />追加</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* List */}
          <TabsContent value="list">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>明細一覧（{filterMonth}）</CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">月</Label>
                  <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="max-w-[160px]" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-2">日付</th>
                        <th className="py-2 pr-2">支払者</th>
                        <th className="py-2 pr-2">カテゴリ</th>
                        <th className="py-2 pr-2">メモ</th>
                        <th className="py-2 pr-2 text-right">金額</th>
                        <th className="py-2 pr-2">収支</th>
                        <th className="py-2 pr-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((t) => (
                        <tr key={t.id} className="border-b hover:bg-slate-50">
                          <td className="py-2 pr-2">{t.date}</td>
                          <td className="py-2 pr-2">{t.payer}</td>
                          <td className="py-2 pr-2">{t.category}</td>
                          <td className="py-2 pr-2">{t.memo}</td>
                          <td className="py-2 pr-2 text-right">{prettyJPY(t.amount)}</td>
                          <td className="py-2 pr-2">{t.kind === "income" ? "収入" : "支出"}</td>
                          <td className="py-2 pr-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => startEdit(t)}><Edit3 className="h-4 w-4" /></Button>
                              <Button size="sm" variant="destructive" onClick={() => removeTxn(t.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {visible.length === 0 && (
                        <tr>
                          <td className="py-6 text-center text-slate-500" colSpan={7}>この月のデータはありません。レシートを取り込むか、手入力で追加してください。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advisor */}
          <TabsContent value="ai" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>AI分析（OpenAI）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  表示中のデータ（月: <b>{filterMonth}</b> を基準）をAIに送り、サマリー/洞察/注意点/提案のJSONを受け取って表示します。
                </p>
                <div className="flex gap-2">
                  <Button onClick={runAIAnalysis} disabled={aiBusy}>
                    {aiBusy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    本格AIで分析する
                  </Button>
                  {aiBusy && <span className="text-sm text-slate-500">{aiLog}</span>}
                </div>

                {/* 出力 */}
                {aiOut && (
                  <div className="space-y-4 mt-4">
                    <Alert>
                      <Sparkles className="h-4 w-4" />
                      <AlertTitle>サマリー</AlertTitle>
                      <AlertDescription>{aiOut.summary}</AlertDescription>
                    </Alert>

                    {!!aiOut.insights?.length && (
                      <div>
                        <div className="font-semibold mb-1">洞察</div>
                        <ul className="list-disc pl-6 space-y-1 text-slate-700">
                          {aiOut.insights.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}

                    {!!aiOut.warnings?.length && (
                      <div>
                        <div className="font-semibold mb-1 text-red-600">注意点</div>
                        <ul className="list-disc pl-6 space-y-1 text-slate-700">
                          {aiOut.warnings.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}

                    {!!aiOut.suggestions?.length && (
                      <div>
                        <div className="font-semibold mb-1 text-emerald-600">提案</div>
                        <ul className="list-disc pl-6 space-y-1 text-slate-700">
                          {aiOut.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* <Card>
              <CardHeader>
                <CardTitle>（オプション）AI API 接続設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-slate-600">OpenAI互換エンドポイントとAPIキーを入力すると、将来ここで家計レビューの自動生成が可能です（このデモでは実呼び出しは行いません）。</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <Label>Base URL</Label>
                    <Input placeholder="http://host.docker.internal:1234/v1" disabled />
                  </div>
                  <div>
                    <Label>API Key</Label>
                    <Input type="password" placeholder="sk-..." disabled />
                  </div>
                </div>
              </CardContent>
            </Card> */}
            {/* === 進捗グラフ（日別）: 棒 = 当日支出 / 折れ線 = 累計支出 & 累計予算 === */}

          </TabsContent>
        </Tabs>

      </motion.div>
    </div>
  );
}
