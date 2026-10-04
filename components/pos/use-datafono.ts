'use client';

import { useCallback, useEffect, useState } from 'react';
import { esErrorDatafono, leerDatafono, SIN_SUMUP, type EstadoDatafonoServidor, type ProveedorDatafono } from '@/lib/pos/datafono-cliente';
import type { LectorDatafono } from '@/lib/pos/datafono';

/**
 * El datáfono del estudio según el servidor (que pregunta a Stripe o a SumUp), para pintar
 * el botón con su estado real. `estado` es `null` mientras no hay respuesta, o si
 * la pregunta falló: quien lo use cae en lo que ya sabía (el catálogo de la Caja),
 * nunca en «desconectado».
 */
export function useDatafono(activo = true) {
  const [estado, setEstado] = useState<EstadoDatafonoServidor | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [comprobando, setComprobando] = useState(false);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    leerDatafono().then(r => {
      if (!vivo) return;
      setComprobando(false);
      if (!esErrorDatafono(r)) setEstado(r);
    });
    return () => { vivo = false; };
  }, [activo, vuelta]);

  /** Vuelve a preguntar (p. ej. tras encender el datáfono). */
  const recargar = useCallback(() => { setComprobando(true); setVuelta(v => v + 1); }, []);

  /** Lo que devolvió el servidor al conectar o renombrar: no hace falta volver a preguntar. */
  const ponerLector = useCallback((lector: LectorDatafono | null, proveedor?: ProveedorDatafono) => {
    setEstado(e => ({
      stripeConectado: e?.stripeConectado ?? proveedor !== 'sumup',
      sumup: e?.sumup ?? SIN_SUMUP,
      proveedor: lector === null ? null : proveedor ?? e?.proveedor ?? null,
      direccion: e?.direccion ?? null, test: e?.test ?? false,
      emparejado: lector !== null, lector,
    }));
  }, []);

  return { estado, comprobando, recargar, ponerLector };
}
