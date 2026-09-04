'use client';
import { addDias, etiquetaDia, fechaCorta, hoyISO } from '@/lib/student/formato';
/**
 * ⚠️ Sin `aria-pressed`: el paquete lo pone junto a `aria-selected` sobre un
 * `role="tab"`, y ese rol no lo admite — un lector de pantalla anuncia dos
 * estados a la vez. `aria-selected` es el correcto para una pestaña.
 *
 * Pills de día (kit): activa en tinta invertida. Scroll horizontal sin barra. */
export function DateSelector({ value, onChange, dias = 7 }: { value: string; onChange: (iso: string) => void; dias?: number }) {
  const h = hoyISO();
  return (
    <div role="tablist" aria-label="Día" className="no-scrollbar" style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '0 18px' }}>
      {Array.from({ length: dias }).map((_, i) => { const iso = addDias(h, i); return (
        <button key={iso} role="tab" type="button" className="day" aria-selected={iso === value} onClick={() => onChange(iso)}>{etiquetaDia(iso)}<small>{fechaCorta(iso).slice(4)}</small></button>
      ); })}
    </div>
  );
}
