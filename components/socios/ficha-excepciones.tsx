'use client';

// F2 (B2.9) — Excepciones por socia ("porque lo digo yo"): toggles en la ficha que
// eximen a esta socia de automatizaciones concretas. Sin formulario, sin reproche.

import { useStudio } from '@/lib/studio-context';
import { tieneExcepcion, TIPOS_EXCEPCION, EXCEPCION_META, type TipoExcepcion } from '@/lib/excepciones';
import { ShieldOff } from 'lucide-react';

export function FichaExcepciones({ socioId }: { socioId: string }) {
  const { socioExcepciones, ponerExcepcion, quitarExcepcion } = useStudio();

  function toggle(tipo: TipoExcepcion, on: boolean) {
    if (on) ponerExcepcion(socioId, tipo, null);
    else quitarExcepcion(socioId, tipo);
  }

  return (
    <div className="border border-border rounded-xl p-5">
      <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
        <ShieldOff size={15} className="text-muted-foreground shrink-0" /> Excepciones
      </p>
      <p className="text-xs text-muted-foreground mb-3">Porque lo dices tú: exime a esta socia de automatizaciones concretas.</p>
      <div className="space-y-3">
        {TIPOS_EXCEPCION.map(tipo => {
          const on = tieneExcepcion(socioExcepciones, socioId, tipo);
          return (
            <label key={tipo} className="flex items-start justify-between gap-3 cursor-pointer">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">{EXCEPCION_META[tipo].label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{EXCEPCION_META[tipo].descripcion}</p>
              </div>
              <input
                type="checkbox"
                checked={on}
                onChange={e => toggle(tipo, e.target.checked)}
                className="mt-0.5 shrink-0 h-4 w-4 rounded accent-[var(--brand)] cursor-pointer"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
