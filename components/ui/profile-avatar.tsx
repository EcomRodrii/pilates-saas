'use client';

import { memo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Memoji avatars (tapback.co) ───────────────────────────────────────────────
// `avatarId` can also be `memoji:<seed>` — a deterministic illustrated avatar
// fetched from the public tapback.co API (same seed always returns the same
// image). No local assets, no build step: just an <img src>.

const MEMOJI_PREFIX = 'memoji:';

function memojiSeedOf(avatarId: string | null | undefined): string | null {
  return avatarId?.startsWith(MEMOJI_PREFIX) ? avatarId.slice(MEMOJI_PREFIX.length) : null;
}

function memojiIdFor(seed: string): string {
  return `${MEMOJI_PREFIX}${seed}`;
}

function memojiUrl(seed: string): string {
  return `https://www.tapback.co/api/avatar/${encodeURIComponent(seed)}.webp`;
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function initialsOf(a: string, b?: string) {
  return `${a?.[0] ?? ''}${b?.[0] ?? ''}`.toUpperCase();
}

// ─── Display component ─────────────────────────────────────────────────────────
// Drop-in replacement for the old "colored initials circle" pattern — falls back
// to initials when no predefined avatar has been chosen yet.

const SIZE_CLS: Record<string, string> = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-11 h-11 text-[14px]',
  lg: 'w-16 h-16 text-[20px]',
  xl: 'w-24 h-24 text-[28px]',
};

// memo: se usa en filas de listas (equipo, clientas) y en sidebar/profile-menu,
// que se re-renderizan a menudo por estado ajeno al avatar — props primitivos,
// candidato natural.
export const ProfileAvatar = memo(function ProfileAvatar({
  avatarId, nombre, apellidos, color, size = 'md', className, fotoUrl,
}: {
  avatarId?: string | null;
  nombre: string;
  apellidos?: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  fotoUrl?: string | null;
}) {
  const memojiSeed = memojiSeedOf(avatarId);
  const cls = cn('rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold', SIZE_CLS[size], className);

  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- foto subida por la socia, no un asset estático conocido en build
    return <img src={fotoUrl} alt={nombre} className={cls} style={{ objectFit: 'cover' }} loading="lazy" decoding="async" />;
  }

  if (memojiSeed) {
    // eslint-disable-next-line @next/next/no-img-element -- imagen externa (tapback.co), no un asset estático conocido en build
    return <img src={memojiUrl(memojiSeed)} alt={nombre} className={cls} style={{ objectFit: 'cover' }} loading="lazy" decoding="async" />;
  }

  return (
    <div className={cls} style={{ backgroundColor: color ? `${color}1A` : 'var(--muted)', color: color ?? 'var(--muted-foreground)' }}>
      {initialsOf(nombre, apellidos)}
    </div>
  );
});

// ─── Picker ─────────────────────────────────────────────────────────────────────

const MEMOJI_BATCH_SIZE = 8;

export const AvatarPicker = memo(function AvatarPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const currentMemojiSeed = memojiSeedOf(value);
  const [memojiSeeds, setMemojiSeeds] = useState<string[]>(() => {
    const seeds = Array.from({ length: MEMOJI_BATCH_SIZE }, randomSeed);
    if (currentMemojiSeed && !seeds.includes(currentMemojiSeed)) seeds[0] = currentMemojiSeed;
    return seeds;
  });

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Memojis</p>
          <button
            type="button"
            onClick={() => setMemojiSeeds(Array.from({ length: MEMOJI_BATCH_SIZE }, randomSeed))}
            className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shuffle size={11} />Ver otros
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {memojiSeeds.map(seed => {
            const id = memojiIdFor(seed);
            const selected = currentMemojiSeed === seed;
            return (
              <button
                key={seed}
                type="button"
                onClick={() => onChange(selected ? null : id)}
                className={cn(
                  'w-12 h-12 rounded-full overflow-hidden shrink-0 bg-muted transition-all',
                  selected ? 'ring-2 ring-brand ring-offset-2' : 'hover:opacity-80',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen externa (tapback.co) */}
                <img src={memojiUrl(seed)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
