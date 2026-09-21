'use client';

import { useState } from 'react';
import type { AjustesApertura } from '@/lib/opening/ajustes';

interface Props {
  fechaApertura: string | null;
  ajustes: AjustesApertura;
  /** Devuelve el error a enseñar, o null si se guardó. */
  onGuardar: (cambios: { fechaApertura: string; ajustes: AjustesApertura }) => Promise<string | null>;
  onCancelar: () => void;
}

type Campo = { clave: keyof AjustesApertura; etiqueta: string; ayuda: string; sufijo: string; min: number; max: number; paso?: number };

// Cada supuesto con la pregunta que contesta: la propietaria no piensa en
// «umbral amarillo», piensa en «cuándo quiero que me avise».
const CAMPOS: Campo[] = [
  { clave: 'objetivoPreventaPct', etiqueta: 'Objetivo de preventa', ayuda: 'Qué parte de las plazas quieres tener vendida antes de abrir.', sufijo: '%', min: 1, max: 100 },
  { clave: 'ventanaSemanas', etiqueta: 'Previsión', ayuda: 'Cuántas semanas hacia delante se calculan.', sufijo: 'semanas', min: 1, max: 17 },
  { clave: 'sesionesSemanaSinTope', etiqueta: 'Clases por semana de una cuota ilimitada', ayuda: 'Para las que aún no han venido nunca.', sufijo: 'por semana', min: 0.5, max: 7, paso: 0.5 },
  { clave: 'semanasBonoSinCaducidad', etiqueta: 'Un bono sin caducidad se gasta en', ayuda: 'Para repartir sus sesiones en el tiempo.', sufijo: 'semanas', min: 1, max: 52 },
  { clave: 'conversionLeadsPct', etiqueta: 'Interesadas que acaban apuntándose', ayuda: 'Solo para la línea de interesadas; no cuenta en la ocupación.', sufijo: '%', min: 0, max: 100 },
  { clave: 'umbralAmarilloPct', etiqueta: 'Avisar de que se va llenando a partir de', ayuda: 'Ocupación prevista.', sufijo: '%', min: 1, max: 99 },
  { clave: 'umbralRojoPct', etiqueta: 'Avisar de que te quedas sin plazas a partir de', ayuda: 'Ocupación prevista.', sufijo: '%', min: 1, max: 150 },
];

export function AjustesAperturaForm({ fechaApertura, ajustes, onGuardar, onCancelar }: Props) {
  const [fecha, setFecha] = useState(fechaApertura ?? '');
  const [valores, setValores] = useState<Record<keyof AjustesApertura, string>>(
    () => Object.fromEntries(CAMPOS.map(c => [c.clave, String(ajustes[c.clave])])) as Record<keyof AjustesApertura, string>,
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setGuardando(true);
    setError(null);
    const cambios = Object.fromEntries(CAMPOS.map(c => [c.clave, Number(valores[c.clave])])) as unknown as AjustesApertura;
    const err = await onGuardar({ fechaApertura: fecha, ajustes: cambios });
    setGuardando(false);
    if (err) setError(err);
  }

  const campo = 'h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-[13px] tabular-nums text-foreground';

  return (
    <form onSubmit={(ev) => void guardar(ev)} className="mt-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <p className="text-[12.5px] font-semibold text-foreground">Ajustar previsión</p>
      <div className="mt-2 space-y-2.5">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-foreground">Fecha de apertura</span>
          <input required type="date" value={fecha} onChange={ev => setFecha(ev.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground" />
        </label>
        {CAMPOS.map(c => (
          <label key={c.clave} className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[12px] text-foreground">{c.etiqueta}</span>
              <span className="block text-[11px] leading-snug text-muted-foreground">{c.ayuda}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <input required type="number" inputMode="decimal" min={c.min} max={c.max} step={c.paso ?? 1}
                value={valores[c.clave]} onChange={ev => setValores({ ...valores, [c.clave]: ev.target.value })}
                aria-label={c.etiqueta} className={campo} />
              <span className="w-16 text-[11px] text-muted-foreground">{c.sufijo}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={guardando} className="h-9 rounded-lg bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} className="h-9 px-2 text-[12px] text-muted-foreground hover:underline">Cancelar</button>
      </div>
    </form>
  );
}
