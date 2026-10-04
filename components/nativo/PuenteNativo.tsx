'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { abrirFuera, alAbrirEnlace, alPulsarAviso, esAppNativa, estiloBarraDeEstado, esVueltaDeOAuth, ocultarPantallaDeCarga } from '@/lib/nativo/puente';
import { destinoDeEnlace } from '@/lib/nativo/destino-enlace';
import { tintaBarraDeEstado } from '@/lib/nativo/barra-de-estado';

/**
 * Lo que la app de iOS necesita en TODAS sus pantallas, y que en la web no hace
 * nada (sale en la primera línea del efecto):
 *
 * - Un enlace a otro dominio, o uno que pide ventana nueva, no puede abrir una
 *   «pestaña»: dentro de la app no existen. Va a un Safari por encima (vuelve con
 *   «OK») o, si es nuestra web, se navega dentro. Igual con `window.open`.
 * - Pulsar un aviso lleva a su pantalla.
 * - Un enlace universal (el del correo, la vuelta de un pago) lleva a su ruta.
 * - Al montarse, la página ya está pintada: quita el logo del arranque.
 * - La barra de estado, con letras que se lean sobre el fondo de la app
 *   (`fondoOscuro`: el estilo «Carbón» del estudio). Las pantallas con foto
 *   arriba la cambian ellas (`StudioHeader`).
 *
 * Se monta en la app de cada estudio y en la entrada (`/app`).
 */
export function PuenteNativo({ fondoOscuro = false }: { fondoOscuro?: boolean } = {}) {
  const r = useRouter();

  useEffect(() => {
    if (!esAppNativa()) return;
    void estiloBarraDeEstado(tintaBarraDeEstado({ fondoOscuro }));
  }, [fondoOscuro]);

  useEffect(() => {
    if (!esAppNativa()) return;
    document.documentElement.dataset.appNativa = '1';
    void ocultarPantallaDeCarga();

    const ir = (destino: ReturnType<typeof destinoDeEnlace>) => {
      if (!destino) return false;
      if (destino.tipo === 'fuera') void abrirFuera(destino.url);
      else r.push(destino.ruta);
      return true;
    };

    const alHacerClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.hasAttribute('download')) return;
      if (ir(destinoDeEnlace(a.getAttribute('href'), window.location.origin, a.target === '_blank'))) e.preventDefault();
    };
    document.addEventListener('click', alHacerClic, true);

    // `window.open('', …)` (una ventana vacía para escribir en ella) no tiene
    // sentido aquí: se devuelve `null`, como un navegador que bloquea la ventana,
    // y quien la pedía ya trata ese caso. La factura va por la hoja de compartir.
    const abrirOriginal = window.open;
    window.open = ((url?: string | URL) => {
      ir(destinoDeEnlace(url ? String(url) : null, window.location.origin, true));
      return null;
    }) as typeof window.open;

    let dejarAvisos: (() => void) | null = null;
    let dejarEnlaces: (() => void) | null = null;
    let vivo = true;
    void alPulsarAviso((aviso) => { if (aviso.ruta) r.push(aviso.ruta); })
      .then((f) => { if (vivo) dejarAvisos = f; else f(); });
    // La vuelta de un login por navegador (`/auth/vuelta?code=…`) la canjea quien
    // lo abrió (`loginConGoogleNativo`); navegar a ella aquí la gastaría dos veces.
    void alAbrirEnlace((ruta) => { if (!esVueltaDeOAuth(ruta, '/auth/vuelta')) r.push(ruta); })
      .then((f) => { if (vivo) dejarEnlaces = f; else f(); });

    return () => {
      vivo = false;
      document.removeEventListener('click', alHacerClic, true);
      window.open = abrirOriginal;
      dejarAvisos?.();
      dejarEnlaces?.();
    };
  }, [r]);

  return null;
}
