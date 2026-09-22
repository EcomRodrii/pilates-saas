'use client';

import { useCallback, useEffect, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import type { AutonomiaConfig } from '@/lib/decision/autonomia';

export interface AutonomiaEstado {
  config: AutonomiaConfig | null;
  tiposDisponibles: string[];
  maxTope: number;
  guardando: boolean;
  error: string | null;
  guardar: (prev: AutonomiaConfig, next: AutonomiaConfig) => Promise<void>;
}

// Única fuente de la config del piloto automático — auditoría de arquitectura
// (22-sep-2026): antes `page.tsx` (para "Requiere tu aprobación") y
// PilotoAutomatico hacían cada uno su propio fetch con su propio estado, sin
// invalidarse entre sí. Cambiar algo dentro del piloto dejaba "Requiere tu
// aprobación" con el valor de antes hasta recargar la página entera. Ahora
// `page.tsx` es el único dueño (llama a este hook una vez) y pasa el
// resultado a `<PilotoAutomatico autonomia={...} />` por props.
export function useAutonomiaConfig(): AutonomiaEstado {
  const [config, setConfig] = useState<AutonomiaConfig | null>(null);
  const [tiposDisponibles, setTiposDisponibles] = useState<string[]>([]);
  const [maxTope, setMaxTope] = useState(50);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/decisiones/autonomia', { headers: { ...(await authHeader()) } });
        if (!res.ok) return;
        const d = await res.json();
        if (!vivo) return;
        setConfig(d.config ?? null);
        setTiposDisponibles(d.tiposDisponibles ?? []);
        setMaxTope(d.maxDiarioTope ?? 50);
      } catch { /* silencioso: el bloque "Requiere tu aprobación" y la tarjeta del piloto simplemente no aparecen */ }
    })();
    return () => { vivo = false; };
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

  return { config, tiposDisponibles, maxTope, guardando, error, guardar };
}
