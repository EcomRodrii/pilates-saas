'use client';

import { useSyncExternalStore } from 'react';
import { Smartphone } from 'lucide-react';
import {
  avisoAppDescartado, claveAvisoApp, hastaTrasDescartar, urlAppInstructora,
} from '@/lib/avisos/app-instructora';

// Aviso para la instructora en el panel: su trabajo ya está en la app del
// estudio. Es el primer paso para retirar Tentare Core (ver
// `lib/avisos/app-instructora.ts`): se ve, se puede descartar y no bloquea nada.
//
// `useSyncExternalStore` y no un `useEffect` que lea localStorage: en el
// servidor no hay almacenamiento (se pinta descartado, sin marcado) y en el
// cliente se resuelve sin un setState dentro de un efecto.

const EVENTO_DESCARTE = 'tentare:aviso-app-instructora';

function suscribir(avisar: () => void): () => void {
  window.addEventListener('storage', avisar);
  window.addEventListener(EVENTO_DESCARTE, avisar);
  return () => {
    window.removeEventListener('storage', avisar);
    window.removeEventListener(EVENTO_DESCARTE, avisar);
  };
}

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function AvisoAppInstructora({ studioId, slug }: { studioId: string; slug: string }) {
  const clave = claveAvisoApp(studioId);
  // Un booleano, no la hora: un `getSnapshot` que devuelve algo distinto en cada
  // llamada (Date.now()) hace que React vuelva a pintar sin fin.
  const descartado = useSyncExternalStore(
    suscribir,
    () => avisoAppDescartado(leer(clave), Date.now()),
    () => true,
  );
  if (descartado) return null;

  const ahoraNo = () => {
    try {
      localStorage.setItem(clave, hastaTrasDescartar(Date.now()));
    } catch {
      // Sin almacenamiento (modo privado estricto) no se puede recordar: el
      // aviso volverá a salir en la siguiente carga, que es lo menos malo.
    }
    window.dispatchEvent(new Event(EVENTO_DESCARTE));
  };

  return (
    <section
      aria-label="La app del estudio"
      data-testid="aviso-app-instructora"
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Smartphone size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">Tu trabajo, ahora en la app del estudio</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {/* Sin «tus ausencias»: /mi-perfil ya tiene una sección con ese
                título, y repetirlo aquí la hacía ambigua (para la lectura y
                para los tests que la buscan por texto). */}
            Tu agenda, pedir una baja, cubrir clases, pasar lista y avisar de vacaciones, desde el móvil. Entra con esta misma cuenta.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        {/* <a> y no <Link>: la app del estudio es otra raíz de la aplicación. */}
        <a
          href={urlAppInstructora(slug)}
          className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-foreground"
        >
          Abrir la app
        </a>
        <button
          type="button"
          onClick={ahoraNo}
          className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted"
        >
          Ahora no
        </button>
      </div>
    </section>
  );
}
