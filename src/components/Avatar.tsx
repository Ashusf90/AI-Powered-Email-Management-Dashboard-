import { useState } from 'react';
import { getInitials } from '../lib/format';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  const sizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-[11px]'
      : size === 'lg'
        ? 'w-11 h-11 text-sm'
        : 'w-9 h-9 text-xs';

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-full object-cover border border-slate-200 shrink-0 bg-slate-100`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${sizeClass} rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-medium flex items-center justify-center shrink-0 select-none`}
    >
      {getInitials(name)}
    </div>
  );
}
