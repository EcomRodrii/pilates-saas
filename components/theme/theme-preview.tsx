'use client';

import { Calendar, Home, CreditCard, Play } from 'lucide-react';
import { themeToCssVars } from '@/lib/theme-runtime';
import type { ThemeConfig } from '@/lib/theme-schema';

// Preview en vivo del tema: renderiza UI representativa del portal de socias
// (cabecera + logo, botones, tarjeta de clase, chips, tab bar) dentro de un
// contenedor con las CSS variables del tema aplicadas. Se re-renderiza al
// instante cuando cambia `config` — no necesita servidor ni iframe.
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
      className="rounded-2xl overflow-hidden border border-border shadow-sm select-none"
      style={{ ...vars, backgroundColor: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)' }}
    >
      {/* Cabecera */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-white/70 border-b border-black/5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain" />
        ) : (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black"
            style={{ backgroundColor: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)' }}
          >
            {nombre[0]}
          </div>
        )}
        <span className="text-sm font-bold">{nombre}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Botones */}
        <div className="flex gap-2">
          <button
            className="px-3.5 py-2 text-[13px] font-bold"
            style={{ backgroundColor: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', borderRadius: 'var(--radius-md)' }}
          >
            Reservar
          </button>
          <button
            className="px-3.5 py-2 text-[13px] font-semibold border"
            style={{ color: 'var(--portal-brand)', borderColor: 'var(--portal-brand)', borderRadius: 'var(--radius-md)' }}
          >
            Ver plan
          </button>
        </div>

        {/* Chips de nivel */}
        <div className="flex gap-2">
          {['Todos', 'Reformer', 'Mat'].map((c, i) => (
            <span
              key={c}
              className="text-[11px] font-semibold px-2.5 py-1"
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

        {/* Tarjeta de clase */}
        <div
          className="p-3 bg-white shadow-sm"
          style={{ borderRadius: 'var(--radius-lg)', borderLeft: '3px solid var(--portal-brand)' }}
        >
          <p className="text-[13px] font-bold">Reformer Flow · 10:00</p>
          <p className="text-[11px]" style={{ color: 'var(--portal-brand-secondary)' }}>
            con Laura · 3 plazas libres
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex bg-white/95 border-t border-black/5">
        {[
          { icon: Calendar, on: true },
          { icon: Home, on: false },
          { icon: CreditCard, on: false },
          { icon: Play, on: false },
        ].map(({ icon: Icon, on }, i) => (
          <div key={i} className="flex-1 flex justify-center py-2.5">
            <span
              className="w-8 h-6 flex items-center justify-center rounded-full"
              style={on ? { backgroundColor: 'var(--portal-brand)' } : undefined}
            >
              <Icon size={17} style={{ color: on ? 'var(--portal-brand-foreground)' : '#C7C7CC' }} strokeWidth={on ? 2.5 : 1.8} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
