'use client';

import { useCallback, useEffect, useRef, useState, useId } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { authHeader } from '@/lib/api-client';

interface AutonomiaConfig {
  activa: boolean;
  tiposPermitidos: string[];
  maxDiario: number;
}

const TIPO_LABEL: Record<string, string> = {
  ENVIAR_EMAIL: 'Emails de reactivación y recordatorio',
  CONTACTO_MANUAL: 'Mensajes a clientas (email o WhatsApp)',
};

// Piloto automático del Decision OS: deja que las recomendaciones de ALTA
// confianza se ejecuten solas (dentro de una allowlist y un tope diario). Off por
// defecto. Nunca cobra tarjetas — solo mensajes.
export function PilotoAutomatico() {
  const uid = useId();
  const [config, setConfig] = useState<AutonomiaConfig | null>(null);
  const [tiposDisponibles, setTiposDisponibles] = useState<string[]>([]);
  const [maxTope, setMaxTope] = useState(50);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El input de "máximo por día" muta `config.maxDiario` en cada tecleo (para
  // que se vea lo que se escribe) ANTES de guardar en `onBlur` — por eso no
  // puede usar el `config` del momento del blur como `prev` (ya está mutado).
  // Se guarda el valor de verdad al entrar en el campo.
  const maxDiarioAlEntrar = useRef<AutonomiaConfig | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/decisiones/autonomia', { headers: { ...(await authHeader()) } });
        if (!res.ok) return;
        const d = await res.json();
        setConfig(d.config);
        setTiposDisponibles(d.tiposDisponibles ?? []);
        setMaxTope(d.maxDiarioTope ?? 50);
      } catch { /* silencioso: la tarjeta simplemente no aparece */ }
    })();
  }, []);

  // El piloto automático AUTO-ENVÍA mensajes a clientas mientras esté ON: si el
  // servidor rechaza el cambio (o la petición falla de red), dejar puesto el
  // valor optimista podría mostrar OFF en pantalla mientras el servidor lo
  // sigue teniendo activo — o al revés. `prev` se recibe explícito de quien
  // llama (que ya tiene el `config` actual a mano) y se restaura en las dos
  // ramas de fallo, en vez de fiarse de un closure de `config` potencialmente
  // obsoleto dentro de este `useCallback` con deps vacías.
  const guardar = useCallback(async (prev: AutonomiaConfig, next: AutonomiaConfig) => {
    setConfig(next); // optimista
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/decisiones/autonomia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(next),
      });
      if (!res.ok) { setConfig(prev); setError('No se pudo guardar'); return; }
      const d = await res.json();
      setConfig(d.config); // el servidor devuelve la config saneada (autoritativa)
    } catch {
      setConfig(prev);
      setError('Error de conexión');
    } finally {
      setGuardando(false);
    }
  }, []);

  if (!config) return null;

  const toggleTipo = (tipo: string) => {
    const set = new Set(config.tiposPermitidos);
    if (set.has(tipo)) set.delete(tipo); else set.add(tipo);
    guardar(config, { ...config, tiposPermitidos: [...set] });
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10">
            <Sparkles size={16} className="text-brand-medio" />
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
              value={config.maxDiario}
              onFocus={() => { maxDiarioAlEntrar.current = config; }}
              onChange={e => setConfig(c => c ? { ...c, maxDiario: Number(e.target.value) } : c)}
              onBlur={() => guardar(maxDiarioAlEntrar.current ?? config, config)}
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
