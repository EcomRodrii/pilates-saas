'use client';

// ─────────────────────────────────────────────────────────────────────────────
// `/dashboard?compartir=1` abre «Comparte el enlace de tu app» (PR-5). Es a
// donde lleva el aviso de las 72 h sin ninguna reserva («Tu horario está listo:
// falta que lo sepan tus alumnas», lib/notifications/catalog.ts): antes llevaba
// a /primeros-pasos, que no compartía nada. Vale para cualquier estudio, con el
// panel nuevo o el de siempre.
//
// El diálogo llega aparte (trae el cartel del QR), solo si se pide.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { avisoAlCompartir } from '@/lib/alta/estado';
import { useAltaNuevaPropia } from './use-pon-en-marcha';

const CompartirEnlace = dynamic(() => import('./compartir-enlace').then(m => m.CompartirEnlace), { ssr: false });

/** El parámetro que lo abre. */
export const PARAMETRO_COMPARTIR = 'compartir';

export function CompartirDesdeEnlace() {
  const { studio } = useCore();
  const rol = useRol();
  const { estado } = useAltaNuevaPropia();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(PARAMETRO_COMPARTIR) !== '1') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la URL solo se lee en el navegador.
    setAbierto(true);
    params.delete(PARAMETRO_COMPARTIR);
    const resto = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${resto ? `?${resto}` : ''}`);
  }, []);

  if (!abierto || !studio?.slug) return null;
  return (
    <CompartirEnlace
      abierto
      onCerrar={() => setAbierto(false)}
      slug={studio.slug}
      nombreEstudio={studio.nombre ?? 'tu estudio'}
      esPropietaria={rol === 'PROPIETARIO'}
      avisoSinClase={avisoAlCompartir(estado)}
    />
  );
}
