'use client';

import { useEffect, type RefObject } from 'react';
import { esAppNativa, estiloBarraDeEstado } from './puente.ts';
import { fotoBajoLaBarra, vigilarTintaSobreFoto } from './barra-de-estado.ts';

/**
 * Letras claras en la barra de estado de iOS mientras la foto de `ref` está
 * detrás de la hora y la batería; al bajar, las del fondo de la página
 * (`fondoOscuro`), y al salir de la pantalla, otra vez esas. Ver
 * `vigilarTintaSobreFoto` (barra-de-estado.ts), que es donde vive la regla.
 *
 * En la web no hace nada: ni escucha el scroll.
 */
export function useTintaSobreFoto(ref: RefObject<HTMLElement | null>, fondoOscuro = false): void {
  useEffect(() => {
    if (!esAppNativa()) return;
    return vigilarTintaSobreFoto({
      fondoOscuro,
      // Sin el elemento (aún no montado o ya fuera), no hay foto detrás.
      sobreFoto: () => {
        const el = ref.current;
        return !!el && fotoBajoLaBarra(el.getBoundingClientRect().bottom);
      },
      aplicar: (tinta) => { void estiloBarraDeEstado(tinta); },
      ventana: window,
    });
  }, [ref, fondoOscuro]);
}
