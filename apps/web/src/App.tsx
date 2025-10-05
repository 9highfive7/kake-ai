import React, { useEffect, useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Upload,
  Trash2,
  Plus,
  Wand2,
  Edit3,
  FileDown,
  RefreshCw,
  Sparkles,
} from "lucide-react";

// 🔹 この下は省略可（長いのでキャンバスにある完全版を使ってもOK）
// 同棲カップル向け家計簿デモ（OCR＋AI風アドバイス）の完全版を
// 貼り付けてください。キャンバスの「同棲カップル向け 家計簿デモ」
// のコード全体がそのまま動作します。
