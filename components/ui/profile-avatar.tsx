'use client';

import { cn } from '@/lib/utils';

// ─── Predefined avatar illustrations ───────────────────────────────────────────
// Flat, minimal face glyphs — no photo upload, just pick one that looks like you.

export type AvatarGenero = 'mujer' | 'hombre';

interface AvatarDef {
  id: string;
  genero: AvatarGenero;
  bg: string;
  skin: string;
  hair: string;
}

export const PREDEFINED_AVATARS: AvatarDef[] = [
  { id: 'mujer-1', genero: 'mujer', bg: '#EDF9C8', skin: '#F0B892', hair: '#3B2A20' },
  { id: 'mujer-2', genero: 'mujer', bg: '#FCE7F3', skin: '#F6D2B0', hair: '#7A4A2B' },
  { id: 'mujer-3', genero: 'mujer', bg: '#DBEAFE', skin: '#8D5A3C', hair: '#1A1A1A' },
  { id: 'mujer-4', genero: 'mujer', bg: '#FEF3C7', skin: '#F0B892', hair: '#C97A2B' },
  { id: 'hombre-1', genero: 'hombre', bg: '#D1FAE5', skin: '#F0B892', hair: '#2B2118' },
  { id: 'hombre-2', genero: 'hombre', bg: '#E0F2FE', skin: '#8D5A3C', hair: '#141414' },
  { id: 'hombre-3', genero: 'hombre', bg: '#FEE2E2', skin: '#F6D2B0', hair: '#5C3A20' },
  { id: 'hombre-4', genero: 'hombre', bg: '#EDF9C8', skin: '#F0B892', hair: '#8A8A82' },
];

function avatarDef(id: string | null | undefined) {
  return PREDEFINED_AVATARS.find(a => a.id === id) ?? null;
}

function AvatarGlyph({ def }: { def: AvatarDef }) {
  const isMujer = def.genero === 'mujer';
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full">
      <circle cx="32" cy="32" r="32" fill={def.bg} />
      {/* neck + shoulders */}
      <path d="M20 58c1-9 6-13 12-13s11 4 12 13" fill={def.skin} />
      {/* head */}
      <circle cx="32" cy="28" r="13" fill={def.skin} />
      {isMujer ? (
        <>
          {/* long hair */}
          <path d="M32 12c-8 0-14 6-14 15 0 5 1 10 2 13 1-3 1-7 1-10 3 2 7 3 11 3s8-1 11-3c0 3 0 7 1 10 1-3 2-8 2-13 0-9-6-15-14-15Z" fill={def.hair} />
          <path d="M17 27c-1 6 0 13 3 18 0-5-1-11 0-15-2-1-2-2-3-3Z" fill={def.hair} />
          <path d="M47 27c1 6 0 13-3 18 0-5 1-11 0-15 2-1 2-2 3-3Z" fill={def.hair} />
        </>
      ) : (
        <>
          {/* short hair */}
          <path d="M32 15c-7 0-12 5-13 11 0 1 0 3 1 4 1-2 2-4 4-5 2 2 5 3 8 3s6-1 8-3c2 1 3 3 4 5 1-1 1-3 1-4-1-6-6-11-13-11Z" fill={def.hair} />
        </>
      )}
      {/* face: eyes + smile */}
      <circle cx="27" cy="29" r="1.4" fill="#1A1A1A" opacity="0.75" />
      <circle cx="37" cy="29" r="1.4" fill="#1A1A1A" opacity="0.75" />
      <path d="M27 35c2 2 8 2 10 0" stroke="#1A1A1A" strokeOpacity="0.55" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
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

export function ProfileAvatar({
  avatarId, nombre, apellidos, color, size = 'md', className,
}: {
  avatarId?: string | null;
  nombre: string;
  apellidos?: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const def = avatarDef(avatarId);
  const cls = cn('rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold', SIZE_CLS[size], className);

  if (def) {
    return (
      <div className={cls}>
        <AvatarGlyph def={def} />
      </div>
    );
  }

  return (
    <div className={cls} style={{ backgroundColor: color ? `${color}1A` : '#F1F1EC', color: color ?? '#8E8E86' }}>
      {initialsOf(nombre, apellidos)}
    </div>
  );
}

// ─── Picker ─────────────────────────────────────────────────────────────────────

export function AvatarPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="space-y-3">
      {(['mujer', 'hombre'] as const).map(genero => (
        <div key={genero}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#A8A89F] mb-1.5">{genero === 'mujer' ? 'Mujer' : 'Hombre'}</p>
          <div className="flex flex-wrap gap-2">
            {PREDEFINED_AVATARS.filter(a => a.genero === genero).map(a => {
              const selected = value === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onChange(selected ? null : a.id)}
                  className={cn(
                    'w-12 h-12 rounded-full overflow-hidden transition-all shrink-0',
                    selected ? 'ring-2 ring-[#C6F94D] ring-offset-2' : 'hover:opacity-80',
                  )}
                >
                  <AvatarGlyph def={a} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
