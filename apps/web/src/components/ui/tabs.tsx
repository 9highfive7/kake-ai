// src/components/ui/tabs.tsx
import React, { createContext, useContext, useState, ReactNode } from "react";

type TabsCtx = {
  value: string;
  setValue: (v: string) => void;
};

const Ctx = createContext<TabsCtx | null>(null);

type TabsProps = {
  defaultValue: string;
  children: ReactNode;
  className?: string;
};

export function Tabs({ defaultValue, children, className }: TabsProps) {
  const [value, setValue] = useState(defaultValue);
  return (
    <Ctx.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="tablist" className={`inline-flex gap-2 p-1 rounded-md bg-slate-100 ${className || ""}`}>
      {children}
    </div>
  );
}

type TriggerProps = {
  value: string;
  children: ReactNode;
  className?: string;
};

export function TabsTrigger({ value, children, className }: TriggerProps) {
  const ctx = useContext(Ctx)!;
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={`px-3 py-1 rounded-md text-sm transition
        ${active ? "bg-white shadow text-slate-900" : "text-slate-600 hover:bg-white/60"}
        ${className || ""}`}
    >
      {children}
    </button>
  );
}

type ContentProps = {
  value: string;
  children: ReactNode;
  className?: string;
};

export function TabsContent({ value, children, className }: ContentProps) {
  const ctx = useContext(Ctx)!;
  if (ctx.value !== value) return null;
  return <div className={className}>{children}</div>;
}
