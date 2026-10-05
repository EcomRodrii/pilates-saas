'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apilarRuta, marcarVolver, reemplazarCima, rutaPadre, TRANSICION_ATRAS } from '@/lib/student/transiciones';

// «Volver» de las fichas de la app de la alumna.
//
// Antes era `router.back()` a secas, y desde un aviso push o un enlace la app
// arranca DIRECTAMENTE en la ficha: no hay nada detrás, así que el botón no
// hacía nada (o, en el navegador, sacaba de la app a la página de antes).
// Ahora: con historial dentro de la app, atrás de verdad; sin él, a la pantalla
// padre (`rutaPadre`), con `replace` para no dejar la ficha detrás.

// Una por pestaña del navegador / por arranque de la app: es memoria de módulo
// a propósito (una recarga empieza de cero, igual que el historial que importa).
let pila: string[] = [];
// La próxima ruta llega por un `router.replace` nuestro: sustituye la cima.
let porReemplazo = false;

/** Lleva la cuenta de por dónde ha pasado. Se monta UNA vez, en el layout del portal. */
export function RastroDeRutas() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    pila = porReemplazo ? reemplazarCima(pila, pathname) : apilarRuta(pila, pathname);
    porReemplazo = false;
  }, [pathname]);
  return null;
}

export function useVolver(): () => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(() => {
    if (pila.length >= 2) {
      marcarVolver();
      router.back();
      return;
    }
    const destino = rutaPadre(pathname ?? '/');
    if (destino === pathname) return;
    porReemplazo = true;
    router.replace(destino, { transitionTypes: TRANSICION_ATRAS });
  }, [router, pathname]);
}
