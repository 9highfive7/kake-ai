import React from 'react'
export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="text-sm text-slate-600" {...props} />
}
