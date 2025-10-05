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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Legend } from "recharts";
import { Upload, Trash2, Plus, Wand2, Edit3, FileDown, RefreshCw, Sparkles, Camera } from "lucide-react";

// ====== 型 ======
type Kind = "expense" | "income";
type Txn = {
  id: string;
  date: string;            // YYYY-MM-DD
  payer: "自分" | "彼女" | "共同";
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
async function callVisionOCRViaServer(imageFile: File): Promise<Txn[]> {
  // 画像を dataURL に
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(imageFile);
  });

  const r = await fetch("/api/ai/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: dataUrl }),
  });

  const raw = await r.text();
  if (!r.ok) {
    try {
      const err = JSON.parse(raw);
      throw new Error(err.error || `HTTP ${r.status}`);
    } catch {
      throw new Error(`HTTP ${r.status}: ${raw || "No body"}`);
    }
  }

  const data = JSON.parse(raw) as { items: Array<Partial<Txn>> };
  const today = new Date().toISOString().slice(0, 10);

  // サーバー側ですでに正規化している想定だが、念のため補完
  const txns: Txn[] = (data.items || []).map((i) => ({
    id: randomId(),
    date: i.date || today,
    payer: (i.payer as any) || "共同",
    category: i.category || "食費",
    memo: i.memo || "",
    amount: Number(i.amount) || 0,
    kind: (i.kind as Kind) || "expense",
  })).filter(t => t.amount > 0 && t.memo.trim() !== "");

  return txns;
}

// ====== メインコンポーネント ======
export default function App() {
  const [txns, setTxns] = useLocalStorage<Txn[]>("kakeibo.txns", []);
  const [filterMonth, setFilterMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrLog, setOcrLog] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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
    for (const t of visible.filter(v => v.kind === "expense")) agg[t.category] = (agg[t.category] || 0) + t.amount;
    return Object.entries(agg).map(([name, value]) => ({ name, value }));
  }, [visible]);

  const monthAgg = useMemo(() => {
    return months.map((m) => ({ month: m, total: (byMonth[m] || []).filter(t => t.kind === "expense").reduce((s, t) => s + t.amount, 0) }));
  }, [months, byMonth]);

  // 収支の合計
  const incomeTotal = visible.filter(t => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const expenseTotal = visible.filter(t => t.kind === "expense").reduce((s, t) => s + t.amount, 0);

  // ====== ここが今回のポイント：重複検出→確認→登録 ======
  function addImportedWithDupPrompt(imported: Txn[]) {
    if (!imported.length) {
      alert("追加できる新規明細はありませんでした（空の結果）。");
      return;
    }
    const existingKeys = new Set(txns.map((t) => dupKey(t)));
    const dups = imported.filter((i) => existingKeys.has(dupKey(i)));
    const news = imported.filter((i) => !existingKeys.has(dupKey(i)));

    if (news.length === 0 && dups.length > 0) {
      // すべて重複 → 確認ダイアログ
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
      const imported = await callVisionOCRViaServer(file);
      setOcrLog(`OCR完了：${imported.length}件候補`);
      addImportedWithDupPrompt(imported);
      if (imported.length) setFilterMonth(imported[0].date.slice(0, 7));
    } catch (e: any) {
      console.error(e);
      setOcrLog(`OpenAI OCRでエラー: ${e?.message || e}`);
      alert(`OpenAI OCRでエラー: ${e?.message || e}`);
    } finally {
      setOcrBusy(false);
    }
  }

  // CSV 書き出し
  function exportCSV() {
    const header = ["id", "date", "payer", "category", "memo", "amount", "kind"].join(",");
    const rows = txns.map(t => [t.id, t.date, t.payer, t.category, t.memo.replaceAll(",", " "), t.amount, t.kind].join(","));
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
    // ここでも重複チェック
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}><FileDown className="mr-2 h-4 w-4" />CSVエクスポート</Button>
            <Button variant="destructive" onClick={resetAll}><Trash2 className="mr-2 h-4 w-4" />全消去</Button>
          </div>
        </header>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList>
            <TabsTrigger value="dashboard">ダッシュボード</TabsTrigger>
            <TabsTrigger value="add">追加/レシートOCR</TabsTrigger>
            <TabsTrigger value="list">明細一覧</TabsTrigger>
            <TabsTrigger value="advisor">AI風アドバイス</TabsTrigger>
          </TabsList>

          {/* Dashboard */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader><CardTitle>月の選択</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Label className="w-24">対象月</Label>
                    <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="max-w-[200px]" />
                  </div>
                  <div className="mt-4 text-sm text-slate-600">今月の支出合計: <span className="font-semibold">{prettyJPY(expenseTotal)}</span></div>
                  <div className="mt-1 text-sm text-slate-600">今月の収入合計: <span className="font-semibold">{prettyJPY(incomeTotal)}</span></div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader><CardTitle>月別推移（支出）</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthAgg}>
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(v: any) => prettyJPY(Number(v))} />
                      <Bar dataKey="total" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>カテゴリ別（支出）</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryAgg} dataKey="value" nameKey="name" outerRadius={100} label />
                      <Tooltip formatter={(v: any) => prettyJPY(Number(v))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

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
            </div>
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
                      if (f) {
                        await handleOpenAIOcr(f);
                      }
                      // 同じファイルを連続選択できるようにリセット
                      e.currentTarget.value = "";
                    }}
                  />

                  {/* 表のボタン: これを押すと上のinputをclick */}
                  <Button
                    type="button"
                    variant="default"
                    disabled={ocrBusy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    画像を選択（OpenAI）
                  </Button>

                  {/* 隠し input: カメラ撮影（スマホ） */}
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        await handleOpenAIOcr(f);
                      }
                      e.currentTarget.value = "";
                    }}
                  />

                  {/* 表のボタン: カメラ起動 */}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={ocrBusy}
                    onClick={() => cameraRef.current?.click()}
                  >
                    写真を撮る（OpenAI）
                  </Button>

                  {ocrBusy && (
                    <Button variant="outline" disabled>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      OCR中…
                    </Button>
                  )}
                </div>

                <Textarea className="mt-3 h-24" value={ocrLog} readOnly placeholder="OCRの進捗・結果が表示されます" />
                <p className="mt-2 text-xs text-slate-500">
                  ※ ブラウザ→サーバ→OpenAIでOCRします。文字密度が高い・傾きが大きい画像は精度が落ちる場合があります。
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
                      <SelectItem value="自分">自分</SelectItem>
                      <SelectItem value="彼女">彼女</SelectItem>
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
          <TabsContent value="advisor" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>AI風アドバイス（ローカル推論）</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Wand2 className="h-4 w-4" />
                  <AlertTitle>ヒント</AlertTitle>
                  <AlertDescription>
                    これはデモのため、単純なルールベースで提案を生成しています。将来的にOpenAI互換のAPIをつなげれば、本格AIに置き換えられます。
                  </AlertDescription>
                </Alert>
                <div className="mt-4 space-y-2">
                  <div className="font-semibold">{advice.summary}</div>
                  <ul className="list-disc pl-6 space-y-1 text-slate-700">
                    {advice.bullets.map((b, i) => (<li key={i}>{b}</li>))}
                    {advice.bullets.length === 0 && <li>支出は良いバランス。現状維持でOK。</li>}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
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
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Start */}
        <div className="mt-6">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline"><Sparkles className="mr-2 h-4 w-4" />クイックスタートを見る</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>このデモの使い方</DialogTitle>
              </DialogHeader>
              <ol className="list-decimal pl-6 space-y-2 text-sm">
                <li>「追加/レシートOCR」でレシート画像をアップロード → OpenAIでOCR。</li>
                <li>認識ミスは「明細一覧」から編集。手入力追加もOK。</li>
                <li>「ダッシュボード」で月の合計、カテゴリ内訳、月別推移を確認。</li>
                <li>「AI風アドバイス」で節約ポイントのヒントを確認。</li>
                <li>「CSVエクスポート」でバックアップ。ローカル保存はlocalStorageです。</li>
              </ol>
              <p className="mt-2 text-xs text-slate-500">
                ※ 本番化時はユーザー/世帯ごとのクラウド保存・レシートテンプレ適応・検索とタグ付け・割り勘精算・共有リンクなどを追加してください。
              </p>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>
    </div>
  );
}
