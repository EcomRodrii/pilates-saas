'use client';

import { useEffect, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import type { AutonomiaConfig } from '@/lib/decision/autonomia';

// Lectura ligera de la config del piloto automático, SOLO para que el Centro
// de Control sepa qué recomendaciones están "pendientes de una acción
// automática" (reorganización §3). No guarda nada — el toggle y su guardado
// siguen viviendo enteros dentro de PilotoAutomatico, sin tocar ese
// componente para no arriesgar su lógica ya probada.
export function useAutonomiaConfig(): AutonomiaConfig | null {
  const [config, setConfig] = useState<AutonomiaConfig | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/decisiones/autonomia', { headers: { ...(await authHeader()) } });
        if (!res.ok) return;
        const d = await res.json();
        if (vivo) setConfig(d.config ?? null);
      } catch { /* silencioso: el bloque "Requiere tu aprobación" simplemente no aparece */ }
    })();
    return () => { vivo = false; };
  }, []);

  return config;
}
