'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Prefiero que me llamen»: el teléfono, solo si lo pide. Prefijo (España por
// defecto), número con formato mientras escribe, hora preferida (opcional) y una
// casilla de consentimiento OBLIGATORIA con una frase corta.
//
// Las reglas viven en lib/llamada (las mismas que repite el servidor). Esto es
// solo el cuerpo del formulario: el estado lo posee el asistente para poder
// validar al pulsar «Terminar».
// ─────────────────────────────────────────────────────────────────────────────

import { useId } from 'react';
import {
  PREFIJOS, formatearNacional, normalizarTelefono,
} from '@/lib/llamada/telefono';
import {
  CONSENTIMIENTO_LLAMADA, ETIQUETA_HORA, HORAS_PREFERIDAS, type HoraPreferida,
} from '@/lib/llamada/solicitud';

export interface DatosLlamada {
  prefijo: string;
  telefono: string;
  consentimiento: boolean;
  hora: HoraPreferida | null;
}

export const LLAMADA_VACIA: DatosLlamada = { prefijo: '34', telefono: '', consentimiento: false, hora: null };

/** Lo que falta para poder pedir la llamada (null = está todo). Un solo mensaje, el más urgente. */
export function errorLlamada(d: DatosLlamada): { campo: 'telefono' | 'consentimiento'; mensaje: string } | null {
  const r = normalizarTelefono(d.prefijo, d.telefono);
  if (!r.ok) return { campo: 'telefono', mensaje: r.error };
  if (!d.consentimiento) return { campo: 'consentimiento', mensaje: 'Marca la casilla para que podamos llamarte.' };
  return null;
}

export function CampoLlamada({
  valor, onCambio, mostrarErrores, errorServidor,
}: {
  valor: DatosLlamada;
  onCambio: (d: DatosLlamada) => void;
  /** Se pone a true al intentar continuar: hasta entonces no se regaña a medio escribir. */
  mostrarErrores: boolean;
  errorServidor?: string | null;
}) {
  const id = useId();
  const err = mostrarErrores ? errorLlamada(valor) : null;
  const idErrTel = `${id}-err-tel`;
  const idErrCons = `${id}-err-cons`;

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-4" data-testid="campo-llamada">
      <p className="text-[13px] font-semibold text-foreground">¿A qué número te llamamos?</p>

      <div className="mt-2 flex gap-2">
        <div className="shrink-0">
          <label htmlFor={`${id}-pref`} className="sr-only">Prefijo del país</label>
          <select
            id={`${id}-pref`}
            value={valor.prefijo}
            onChange={(e) => onCambio({ ...valor, prefijo: e.target.value })}
            className="h-12 rounded-xl border border-border bg-background px-2 text-base text-foreground"
            autoComplete="tel-country-code"
          >
            {PREFIJOS.map((p) => (
              <option key={p.codigo} value={p.codigo}>+{p.codigo} {p.pais}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-tel`} className="sr-only">Teléfono</label>
          <input
            id={`${id}-tel`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={valor.prefijo === '34' ? '612 34 56 78' : 'Tu teléfono'}
            value={valor.telefono}
            onChange={(e) => {
              const crudo = e.target.value;
              // Con «+» o «00» al principio no se reformatea: es un número pegado
              // con su prefijo y `normalizarTelefono` lo entiende tal cual.
              const t = /^\s*(\+|00)/.test(crudo) ? crudo : formatearNacional(valor.prefijo, crudo);
              onCambio({ ...valor, telefono: t });
            }}
            aria-invalid={err?.campo === 'telefono' || undefined}
            aria-describedby={err?.campo === 'telefono' ? idErrTel : undefined}
            className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground"
          />
        </div>
      </div>
      {err?.campo === 'telefono' && (
        <p id={idErrTel} role="alert" className="mt-1.5 text-[12.5px] text-destructive">{err.mensaje}</p>
      )}

      <fieldset className="mt-3">
        <legend className="text-[12.5px] text-muted-foreground">¿Cuándo te viene mejor? (opcional)</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {HORAS_PREFERIDAS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={valor.hora === h}
              onClick={() => onCambio({ ...valor, hora: valor.hora === h ? null : h })}
              className={`min-h-11 rounded-xl border px-3.5 text-[13.5px] font-medium transition-colors ${
                valor.hora === h ? 'border-brand-medio bg-brand-medio text-white' : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {ETIQUETA_HORA[h]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={valor.consentimiento}
          onChange={(e) => onCambio({ ...valor, consentimiento: e.target.checked })}
          aria-invalid={err?.campo === 'consentimiento' || undefined}
          aria-describedby={err?.campo === 'consentimiento' ? idErrCons : undefined}
          className="mt-0.5 size-5 shrink-0 accent-[var(--brand-medio)]"
        />
        <span className="text-[13px] leading-snug text-foreground">{CONSENTIMIENTO_LLAMADA}</span>
      </label>
      {err?.campo === 'consentimiento' && (
        <p id={idErrCons} role="alert" className="mt-1 text-[12.5px] text-destructive">{err.mensaje}</p>
      )}
      {errorServidor && <p role="alert" className="mt-2 text-[12.5px] text-destructive">{errorServidor}</p>}
    </div>
  );
}
