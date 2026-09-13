'use client';

import { Check } from 'lucide-react';
import { DIAS, FRANJAS, celdaKey, type FranjaKey } from '@/lib/sustituciones/franjas';

// La rejilla día × franja de la disponibilidad. Una sola, compartida por la
// instructora («Mi perfil») y por la propietaria cuando la marca por ella
// (Sustituciones): las dos tienen que ver exactamente las mismas celdas que
// guarda `guardarDisponibilidad`.

export function RejillaDisponibilidad({
  activas,
  onToggle,
}: {
  activas: Set<string>;
  onToggle: (dow: number, franja: FranjaKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div
        className="grid items-stretch"
        // ⚠️ Las columnas salen de FRANJAS, no de un número escrito a mano.
        // Estaba fijo en `repeat(3,1fr)` y las franjas son CUATRO desde que
        // se añadió «Última hora»: cada fila metía cinco celdas (etiqueta +
        // 4) en una rejilla de cuatro, así que todo se desplazaba una
        // posición y los días salían en diagonal, con la cabecera de la
        // última franja caída dentro del cuerpo. En el móvil era ilegible.
        style={{ gridTemplateColumns: `auto repeat(${FRANJAS.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b border-border bg-muted/40" />
        {FRANJAS.map((f) => (
          <div key={f.key} className="border-b border-border bg-muted/40 px-2 py-2.5 text-center">
            <div className="text-[12px] font-semibold text-foreground">{f.label}</div>
            <div className="text-[10px] text-muted-foreground">{f.horaInicio}–{f.horaFin}</div>
          </div>
        ))}

        {DIAS.map((d) => (
          <FilaDia key={d.dow} dow={d.dow} label={d.label} activas={activas} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

function FilaDia({
  dow, label, activas, onToggle,
}: {
  dow: number; label: string; activas: Set<string>; onToggle: (dow: number, franja: FranjaKey) => void;
}) {
  return (
    <>
      <div className="flex items-center border-t border-border px-3 text-[12px] font-medium text-muted-foreground">
        {label}
      </div>
      {FRANJAS.map((f) => {
        const on = activas.has(celdaKey(dow, f.key));
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onToggle(dow, f.key)}
            aria-pressed={on}
            aria-label={`${label}, ${f.label}`}
            className={`m-1 flex h-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
              on
                ? 'border-brand bg-brand text-brand-foreground'
                : 'border-border bg-background text-muted-foreground/40 hover:border-muted-foreground'
            }`}
          >
            {on ? <Check size={14} /> : ''}
          </button>
        );
      })}
    </>
  );
}

/** Añade o quita una celda del conjunto sin mutarlo. */
export function alternarCelda(prev: Set<string>, dow: number, franja: FranjaKey): Set<string> {
  const clave = celdaKey(dow, franja);
  const next = new Set(prev);
  if (next.has(clave)) next.delete(clave);
  else next.add(clave);
  return next;
}
