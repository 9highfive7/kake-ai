// apps/web/src/components/ui/dialog.tsx
import React, { useState } from 'react'

export function Dialog({ children }: any) {
  const [open, setOpen] = useState(false)
  // 子に open / setOpen を渡す
  return <div>{React.Children.map(children, (c: any) => React.cloneElement(c, { open, setOpen }))}</div>
}

export function DialogTrigger({ children, setOpen }: any) {
  // トリガークリックで開く
  return React.cloneElement(children, { onClick: () => setOpen(true) })
}

export function DialogContent({ children, open, setOpen }: any) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={() => setOpen(false)}                 // ← 背景クリックで閉じる
    >
      <div
        className="relative w-[600px] max-w-[90vw] rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}         // ← 中身クリックでは閉じない
      >
        {/* × ボタン */}
        <button
          aria-label="閉じる"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => setOpen(false)}
        >
          ×
        </button>

        {/* 子にも setOpen を伝播（必要なら内部から閉じられる） */}
        {React.Children.map(children, (c: any) => React.cloneElement(c, { setOpen }))}
      </div>
    </div>
  )
}

export function DialogHeader({ children }: any) {
  return <div className="mb-2">{children}</div>
}

export function DialogTitle({ children }: any) {
  return <h3 className="text-lg font-semibold">{children}</h3>
}

/** オプション：任意のボタンを“閉じるボタン化”できる */
export function DialogClose({ children, setOpen }: any) {
  return React.cloneElement(children, { onClick: () => setOpen(false) })
}
