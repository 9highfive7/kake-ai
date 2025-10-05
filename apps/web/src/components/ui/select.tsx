import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

type Ctx = {
  open: boolean
  setOpen: (v: boolean) => void
  value: string | undefined
  onValueChange?: (v: string) => void
  triggerRef: React.RefObject<HTMLButtonElement>
}
const SelectCtx = createContext<Ctx | null>(null)
const useSelect = () => {
  const ctx = useContext(SelectCtx)
  if (!ctx) throw new Error('Select components must be used inside <Select>')
  return ctx
}

/** ルート：開閉と選択値を管理 */
export function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string
  onValueChange?: (v: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // クリック外しで閉じる
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return
      const t = triggerRef.current
      const content = document.getElementById('__select_content_portal')
      const target = e.target as Node
      if (t?.contains(target)) return
      if (content?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const ctx = useMemo<Ctx>(() => ({ open, setOpen, value, onValueChange, triggerRef }), [open, value, onValueChange])
  return <SelectCtx.Provider value={ctx}>{children}</SelectCtx.Provider>
}

/** トリガー：見た目のボタン */
export function SelectTrigger({ children }: { children: React.ReactNode }) {
  const { open, setOpen, triggerRef } = useSelect()
  return (
    <button
      ref={triggerRef}
      type="button"
      className={`w-full justify-between rounded-xl border border-slate-300 px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white ${open ? 'ring-2 ring-slate-300' : ''}`}
      onClick={() => setOpen(!open)}
    >
      {children}
    </button>
  )
}

/** Placeholder / 選択表示 */
export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = useSelect()
  return <span className="text-slate-700">{value ?? <span className="text-slate-500">{placeholder || '選択'}</span>}</span>
}

/** ドロップダウン本体（絶対配置・ポータル簡易版） */
export function SelectContent({ children }: { children: React.ReactNode }) {
  const { open, triggerRef } = useSelect()
  const [style, setStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setStyle({
      position: 'fixed',
      top: rect.bottom + 6, // 少し間隔
      left: rect.left,
      width: rect.width,
      zIndex: 50,
    })
  }, [open, triggerRef])

  if (!open) return null
  return (
    <div id="__select_content_portal" style={style}>
      <div className="max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
        {children}
      </div>
    </div>
  )
}

/** 選択肢 */
export function SelectItem({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  const { onValueChange, setOpen } = useSelect()
  return (
    <div
      className="cursor-pointer rounded-lg px-3 py-2 text-sm hover:bg-slate-100"
      onClick={() => {
        onValueChange?.(value)
        setOpen(false)
      }}
    >
      {children}
    </div>
  )
}
