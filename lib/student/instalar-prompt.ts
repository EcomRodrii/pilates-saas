'use client';

// El aviso `beforeinstallprompt` del navegador, guardado para cuando la alumna
// lo pida.
//
// ⚠️ Chrome lo lanza UNA vez y pronto, sin esperar a que la pantalla de Perfil
// esté abierta. Si solo lo escuchara el botón, casi siempre llegaría tarde y el
// botón no aparecería nunca. Por eso lo escucha `RegistroSW` desde que se monta
// la app (`capturarInstalacion`) y lo guarda aquí; Perfil solo lo lee.
//
// El navegador manda el evento una sola vez y `prompt()` solo se puede usar una:
// tras usarlo se suelta, y si la alumna lo rechazó Chrome vuelve a lanzarlo más
// adelante por su cuenta.

import { esAppNativa } from '@/lib/nativo/puente';
import { esIOS, esStandalone } from '@/lib/notifications/push-client';
import {
  estadoInstalacion, type EstadoInstalacion, type ResultadoInstalacion,
} from '@/lib/student/instalar-app';

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let guardado: EventoInstalacion | null = null;
// Si la app se instaló mientras estaba abierta, el prompt ya no vale aunque el evento siga guardado.
let instalada = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(o => o());

/** Empieza a escuchar. Devuelve cómo dejar de hacerlo. Llamarla dos veces no duplica nada. */
export function capturarInstalacion(): () => void {
  const alOfrecer = (e: Event) => {
    // Sin esto Chrome pinta su propia mini-barra y el prompt ya no es nuestro.
    e.preventDefault();
    guardado = e as EventoInstalacion;
    avisar();
  };
  const alInstalar = () => { instalada = true; guardado = null; avisar(); };
  window.addEventListener('beforeinstallprompt', alOfrecer);
  window.addEventListener('appinstalled', alInstalar);
  return () => {
    window.removeEventListener('beforeinstallprompt', alOfrecer);
    window.removeEventListener('appinstalled', alInstalar);
  };
}

export function suscribirInstalacion(cb: () => void): () => void {
  oyentes.add(cb);
  return () => { oyentes.delete(cb); };
}

/** Un string estable (no un objeto nuevo en cada lectura) para `useSyncExternalStore`. */
export function leerEstadoInstalacion(): EstadoInstalacion {
  if (instalada) return 'ya-instalada';
  return estadoInstalacion({
    esNativa: esAppNativa(),
    esStandalone: esStandalone(),
    esIOS: esIOS(),
    hayPrompt: guardado !== null,
    userAgent: navigator.userAgent,
  });
}

/** Servidor y primer pintado: nada. La fila aparece al hidratar, sin salto en el servidor. */
export const estadoInstalacionServidor = (): null => null;

export async function pedirInstalacion(): Promise<ResultadoInstalacion> {
  const e = guardado;
  if (!e) return 'no-disponible';
  // El evento solo vale una vez, lo acepte o no.
  guardado = null;
  avisar();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted' ? 'aceptada' : 'rechazada';
  } catch {
    return 'no-disponible';
  }
}
