'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useCoincideMedio } from '@/lib/hooks/use-coincide-medio';
import { CONSULTA_ESCRITORIO } from '@/lib/panel/escritorio';
import { cambiarAmpliado, estadoAmpliado, estadoAmpliadoServidor, suscribirAmpliado } from '@/lib/panel/ampliar';

/**
 * Quien vuelve a poner el menú. Montado una vez en el armazón, fuera de las
 * páginas, porque sus tres motivos no son de ninguna pantalla:
 *
 * - **Cambiar de pantalla.** Sin menú, se sale con ⌘K, un enlace o «atrás», y la
 *   pantalla de destino puede no tener botón para volver: se quedaría sin menú.
 * - **Escape**, salvo con un diálogo abierto: ahí Escape es suyo.
 * - **Dejar de ser un ordenador** (ventana estrecha): las reglas de ampliado solo
 *   existen desde 1024 px.
 */
export function ControlAmpliado() {
  const pathname = usePathname();
  const escritorio = useCoincideMedio(CONSULTA_ESCRITORIO);
  const ampliado = useSyncExternalStore(suscribirAmpliado, estadoAmpliado, estadoAmpliadoServidor);

  useEffect(() => {
    cambiarAmpliado(false, { animar: false });
  }, [pathname]);

  useEffect(() => {
    if (!escritorio) cambiarAmpliado(false, { animar: false });
  }, [escritorio]);

  useEffect(() => {
    if (!ampliado) return;
    const alPulsarTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const hayDialogo = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
        .some(el => el.checkVisibility?.() ?? true);
      if (!hayDialogo) cambiarAmpliado(false);
    };
    document.addEventListener('keydown', alPulsarTecla);
    return () => document.removeEventListener('keydown', alPulsarTecla);
  }, [ampliado]);

  return null;
}
