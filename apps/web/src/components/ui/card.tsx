import React from 'react'

export function Card({ className='', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-white rounded-2xl shadow-card border border-slate-200 ${className}`} {...props} />;
}
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) { return <div className="p-4 border-b border-slate-100" {...props} /> }
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) { return <h3 className="font-semibold text-lg text-slate-800" {...props} /> }
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) { return <div className="p-4 text-slate-700" {...props} /> }
