'use client';

import { Calendar, Home, CreditCard, Play, TrendingUp, Clock } from 'lucide-react';
import { themeToCssVars } from '@/lib/theme-runtime';
import type { ThemeConfig } from '@/lib/theme-schema';

// Preview en vivo del tema: maqueta fiel de la app de socias (pantalla de móvil)
// con las CSS variables del tema aplicadas. Se re-renderiza al instante cuando
// cambia `config` — sin servidor ni iframe.
export function ThemePreview({
  config,
  logoUrl,
  nombre = 'Tu Estudio',
}: {
  config: ThemeConfig;
  logoUrl?: string | null;
  nombre?: string;
}) {
  const vars = themeToCssVars(config);

  return (
    <div
      className="mx-auto w-full max-w-[300px] rounded-[2.2rem] border-[6px] border-black/85 shadow-xl overflow-hidden select-none"
      style={{ ...vars, backgroundColor: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)' }}
    >
      {/* Notch / status bar */}
      <div className="relative h-6 bg-white/60 flex items-center justify-center">
        <div className="absolute top-1.5 w-16 h-1.5 rounded-full bg-black/70" />
      </div>

      <div className="px-4 pt-3 pb-2 space-y-3.5">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="w-9 h-9 rounded-xl object-contain" />
          ) : (
            <div
              className="w-9 h-9 flex items-center justify-center text-[13px] font-black"
              style={{ backgroundColor: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', borderRadius: 'var(--radius-md)' }}
            >
              {nombre[0]}
            </div>
          )}
          <div className="leading-tight">
            <p className="text-[13px] font-extrabold">Hola, Laura</p>
            <p className="text-[10px]" style={{ color: 'var(--portal-brand-secondary)' }}>{nombre}</p>
          </div>
        </div>

        {/* Hero: próxima clase */}
        <div
          className="p-3.5 text-left"
          style={{ backgroundColor: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', borderRadius: 'var(--radius-lg)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Tu próxima clase</p>
          <p className="text-[15px] font-extrabold mt-0.5">Reformer Flow</p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] opacity-90">
            <Clock size={12} /> Hoy · 10:00 · con Laura
          </div>
          <button
            className="mt-2.5 text-[11px] font-bold px-3 py-1.5"
            style={{ backgroundColor: 'var(--portal-brand-foreground)', color: 'var(--portal-brand)', borderRadius: '999px' }}
          >
            Ver reserva
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          {[{ n: '12', t: 'clases este mes' }, { n: '3', t: 'bonos activos' }].map((s) => (
            <div key={s.t} className="p-2.5" style={{ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-md)' }}>
              <p className="text-[16px] font-extrabold leading-none">{s.n}</p>
              <p className="text-[9.5px] mt-1" style={{ color: 'var(--portal-brand-secondary)' }}>{s.t}</p>
            </div>
          ))}
        </div>

        {/* Chips */}
        <div className="flex gap-1.5">
          {['Todos', 'Reformer', 'Mat'].map((c, i) => (
            <span
              key={c}
              className="text-[10px] font-semibold px-2.5 py-1"
              style={
                i === 0
                  ? { backgroundColor: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', borderRadius: '999px' }
                  : { backgroundColor: 'var(--accent)', color: 'var(--foreground)', borderRadius: '999px' }
              }
            >
              {c}
            </span>
          ))}
        </div>

        {/* Lista de clases */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold">Clases de hoy</p>
          {[{ h: '10:00', n: 'Reformer Flow', p: '3 plazas' }, { h: '18:30', n: 'Mat Pilates', p: 'Últimas 2' }].map((cl) => (
            <div
              key={cl.h}
              className="flex items-center gap-2.5 p-2.5 bg-white shadow-sm"
              style={{ borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--portal-brand)' }}
            >
              <div className="text-[11px] font-extrabold tabular-nums" style={{ color: 'var(--portal-brand)' }}>{cl.h}</div>
              <div className="flex-1 leading-tight">
                <p className="text-[11.5px] font-bold text-[#1a1a1a]">{cl.n}</p>
                <p className="text-[9.5px] text-[#8a8a8a]">{cl.p}</p>
              </div>
              <span
                className="text-[9.5px] font-bold px-2 py-1"
                style={{ backgroundColor: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', borderRadius: '999px' }}
              >
                Reservar
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex bg-white/95 border-t border-black/5 mt-1">
        {[
          { icon: Home, on: true },
          { icon: Calendar, on: false },
          { icon: CreditCard, on: false },
          { icon: TrendingUp, on: false },
          { icon: Play, on: false },
        ].map(({ icon: Icon, on }, i) => (
          <div key={i} className="flex-1 flex justify-center py-2.5">
            <span
              className="w-8 h-6 flex items-center justify-center rounded-full"
              style={on ? { backgroundColor: 'var(--portal-brand)' } : undefined}
            >
              <Icon size={16} style={{ color: on ? 'var(--portal-brand-foreground)' : '#C7C7CC' }} strokeWidth={on ? 2.5 : 1.8} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
