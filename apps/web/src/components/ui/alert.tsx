import React from 'react'
export function Alert({ children }: any){ return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">{children}</div> }
export function AlertTitle({ children }: any){ return <div className="font-semibold">{children}</div> }
export function AlertDescription({ children }: any){ return <div className="text-sm text-slate-600 mt-1">{children}</div> }
