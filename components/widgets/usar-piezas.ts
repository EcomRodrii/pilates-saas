'use client';

import { useEffect, useRef, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { dbWidgetPiezas } from '@/lib/supabase-data';
import type { ConfigConstructor } from '@/lib/widgets/config';
import { leerPiezaGuardada, type PiezaGuardada } from '@/lib/widgets/pieza-panel';

// Lo publicado de cada widget por id (lib/widgets/pieza.ts), para el constructor:
// qué id lleva su código, qué ve su web y con qué fecha se aplicó por última vez
// (el `esperado` de la siguiente vez).
//
// Solo la propietaria: es la única que lo lee (RLS) y la única que puede
// aplicar (/api/estudio/widget-pieza). Para el resto, `listo` con nada: el
// constructor da el código de siempre, que funciona igual.
//
// ⚠️ Sin escritura optimista: lo publicado solo cambia aquí con lo que devuelve
// el servidor. Un 409 (otra pestaña aplicó entretanto) no pisa nada: lo dice.

export type EstadoPiezas = 'cargando' | 'listo' | 'error';
export type ResultadoPublicar = { ok: true; pieza: PiezaGuardada } | { ok: false; error: string };

export function usePiezas(activo: boolean) {
  const [publicadas, setPublicadas] = useState<Record<string, PiezaGuardada>>({});
  const [estado, setEstado] = useState<EstadoPiezas>(activo ? 'cargando' : 'listo');
  // La última versión de lo publicado, para leer el `esperado` dentro de una
  // promesa sin depender de cuándo se vuelve a pintar. Se escribe solo donde
  // cambia lo publicado, nunca al pintar.
  const ultimas = useRef<Record<string, PiezaGuardada>>({});

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void dbWidgetPiezas().then(p => {
      if (!vivo) return;
      if (p) { ultimas.current = p; setPublicadas(p); setEstado('listo'); } else setEstado('error');
    });
    return () => { vivo = false; };
  }, [activo]);

  async function publicar(widget: string, config: ConfigConstructor): Promise<ResultadoPublicar> {
    const esperado = ultimas.current[widget]?.actualizadoEn ?? null;
    try {
      const res = await fetch('/api/estudio/widget-pieza', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ widget, config, esperado }),
      });
      const data = await res.json().catch(() => null) as { error?: unknown } | null;
      const pieza = res.ok ? leerPiezaGuardada(data) : null;
      if (!pieza) {
        return { ok: false, error: typeof data?.error === 'string' ? data.error : 'No se han podido aplicar los cambios. Vuelve a intentarlo.' };
      }
      ultimas.current = { ...ultimas.current, [widget]: pieza };
      setPublicadas(ultimas.current);
      return { ok: true, pieza };
    } catch {
      return { ok: false, error: 'No se han podido aplicar los cambios. Revisa tu conexión.' };
    }
  }

  return { publicadas, estado, publicar };
}
