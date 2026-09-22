'use client';

import { useRef, useState, useId } from 'react';
import { ShieldCheck } from 'lucide-react';
import { TentareOrb } from '@/components/marca/tentare-orb';
import type { AutonomiaConfig, TipoAccion } from '@/lib/decision/autonomia';
import type { AutonomiaEstado } from './use-autonomia-config';

const TIPO_LABEL: Record<string, string> = {
  ENVIAR_EMAIL: 'Emails de reactivación y recordatorio',
  CONTACTO_MANUAL: 'Mensajes a clientas (email o WhatsApp)',
};

// Piloto automático del Decision OS: deja que las recomendaciones de ALTA
// confianza se ejecuten solas (dentro de una allowlist y un tope diario). Off por
// defecto. Nunca cobra tarjetas — solo mensajes.
//
// Sin estado ni fetch propios (auditoría de arquitectura, 22-sep-2026): la
// config y su guardado viven en `useAutonomiaConfig`, una única vez en
// `page.tsx` — este componente solo pinta y llama a `autonomia.guardar`.
export function PilotoAutomatico({ autonomia }: { autonomia: AutonomiaEstado }) {
  const uid = useId();
  const { config, tiposDisponibles, maxTope, guardando, error, guardar } = autonomia;
  const [maxDiarioLocal, setMaxDiarioLocal] = useState<number | null>(null);
  // El input de "máximo por día" muta un valor LOCAL en cada tecleo (para que
  // se vea lo que se escribe) sin tocar la config compartida hasta `onBlur` —
  // así ningún otro consumidor de `autonomia.config` ve un valor a medio
  // escribir. Se guarda el valor de verdad (antes de tocar el campo) al entrar.
  const configAlEntrar = useRef<AutonomiaConfig | null>(null);

  if (!config) return null;

  const maxDiario = maxDiarioLocal ?? config.maxDiario;

  const toggleTipo = (tipo: TipoAccion) => {
    const set = new Set(config.tiposPermitidos);
    if (set.has(tipo)) set.delete(tipo); else set.add(tipo);
    guardar(config, { ...config, tiposPermitidos: [...set] });
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {/* El Orb, no destellos: aquí Tentare ejecuta acciones por su cuenta,
              que es literalmente lo que el Orb significa. `Sparkles` en este
              producto ya quiere decir «novedad» (el changelog). */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10">
            <TentareOrb tam={18} />
          </div>
          <div>
            <h2 className="font-heading text-[15px] font-semibold text-foreground">Piloto automático</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Deja que el Centro de Control ejecute solo las acciones de <span className="font-medium text-foreground">alta confianza</span>. Tú solo revisas el resto.
            </p>
          </div>
        </div>
        {/* Interruptor principal */}
        <button
          type="button"
          role="switch"
          aria-checked={config.activa}
          aria-label="Activar piloto automático"
          onClick={() => guardar(config, { ...config, activa: !config.activa })}
          disabled={guardando}
          className="relative mt-1 inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50"
          style={{ background: config.activa ? 'var(--brand)' : 'var(--muted-foreground)' }}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${config.activa ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Fuera del bloque `config.activa &&` a propósito: si falla justo el
          intento de ENCENDER el interruptor, el revert deja `activa` en
          `false` y desmonta ese bloque — el aviso de error tiene que
          sobrevivir a ese revert para que la propietaria sepa qué pasó, no
          solo ver el interruptor volver solo a su sitio. */}
      {error && !config.activa && <p className="mt-3 text-[12px] text-destructive">{error}</p>}

      {config.activa && (
        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qué puede hacer solo</p>
            <div className="flex flex-col gap-2">
              {tiposDisponibles.map(tipo => (
                <label key={tipo} className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={config.tiposPermitidos.includes(tipo)}
                    onChange={() => toggleTipo(tipo)}
                    disabled={guardando}
                    className="h-4 w-4 rounded accent-[var(--brand)]"
                  />
                  <span className="text-[13px] text-foreground">{TIPO_LABEL[tipo] ?? tipo}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={`${uid}-1`} className="text-[13px] text-foreground">Máximo por día</label>
            <input id={`${uid}-1`}
              type="number" min={0} max={maxTope}
              value={maxDiario}
              onFocus={() => { configAlEntrar.current = config; setMaxDiarioLocal(config.maxDiario); }}
              onChange={e => setMaxDiarioLocal(Number(e.target.value))}
              onBlur={() => {
                const prev = configAlEntrar.current ?? config;
                guardar(prev, { ...config, maxDiario: maxDiarioLocal ?? config.maxDiario });
                setMaxDiarioLocal(null);
              }}
              disabled={guardando}
              className="w-16 rounded-lg border border-border px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <span className="text-[12px] text-muted-foreground">acciones</span>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
            <ShieldCheck size={14} className="shrink-0 text-muted-foreground" />
            <p className="text-[12px] text-muted-foreground">
              Nunca cobra tarjetas ni toca dinero automáticamente. Todo lo que se ejecuta solo queda registrado en Actividad.
            </p>
          </div>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
