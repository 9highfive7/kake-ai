import React, { useState } from 'react'

/** 親は current/setValue を子に伝播。 */
export function Tabs({ defaultValue, children, className='' }: any) {
  const [current, setCurrent] = useState(defaultValue)
  return (
    <div className={className} data-current={current}>
      {React.Children.map(children, (c: any) =>
        React.isValidElement(c)
          ? React.cloneElement(c, { current, setValue: setCurrent })
          : c
      )}
    </div>
  )
}

/** ← ここがポイント：setValue を子の Trigger に渡す */
export function TabsList({ children, current, setValue }: any) {
  return (
    <div className="inline-flex gap-2 rounded-xl bg-slate-200 p-1">
      {React.Children.map(children, (c: any) =>
        React.isValidElement(c) ? React.cloneElement(c, { current, setValue }) : c
      )}
    </div>
  )
}

export function TabsTrigger({ children, value, current, setValue }: any) {
  const active = current === value
  return (
    <button
      className={`px-3 py-1 rounded-lg text-sm ${active ? 'bg-white shadow' : 'text-slate-600'}`}
      onClick={() => setValue(value)}
    >
      {children}
    </button>
  )
}

export function TabsContent({ children, value, current }: any) {
  if (current !== value) return null
  return <div className="mt-4">{children}</div>
}
