import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default'|'outline'|'destructive'
  size?: 'sm'|'md'
};
export function Button({ className='', variant='default', size='md', ...props }: Props) {
  const variants = {
    default: 'bg-slate-900 text-white hover:bg-slate-800',
    outline: 'border border-slate-300 hover:bg-slate-100',
    destructive: 'bg-red-600 text-white hover:bg-red-500',
  } as const;
  const sizes = { sm: 'px-2 py-1 text-sm rounded-xl', md: 'px-3 py-2 rounded-2xl' } as const;
  return <button className={`${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
