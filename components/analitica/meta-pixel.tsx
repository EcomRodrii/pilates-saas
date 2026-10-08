'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { guardarDecision, decisionGuardada, seguirRuta } from '@/lib/meta-pixel-cliente';
import { EVENTO_DECISION, hostConPixel, rutaConPixel } from '@/lib/meta-pixel-reglas';

// Qué se ve y qué se mide viene de UNA lectura: 'servidor' (aún sin navegador),
// 'apagado' (previews, local), 'pendiente' (sin decisión) o la decisión.
type Estado = 'servidor' | 'apagado' | 'pendiente' | 'si' | 'no';

function suscribir(avisar: () => void): () => void {
  window.addEventListener(EVENTO_DECISION, avisar);
  window.addEventListener('storage', avisar);
  return () => {
    window.removeEventListener(EVENTO_DECISION, avisar);
    window.removeEventListener('storage', avisar);
  };
}

function leer(): Estado {
  if (!hostConPixel(window.location.hostname)) return 'apagado';
  return decisionGuardada() ?? 'pendiente';
}

function useEstado(): Estado {
  return useSyncExternalStore(suscribir, leer, (): Estado => 'servidor');
}

const BOTON =
  'inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-border bg-background px-4 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted sm:flex-none';

/**
 * Punto de montaje del píxel de Meta (root layout). Toda la decisión —dónde,
 * quién y con qué permiso— vive en `lib/meta-pixel-reglas.ts`.
 *
 * El aviso sale solo en las rutas que se miden y mientras no haya decisión;
 * cambiarla después se hace desde `/cookies` (`PreferenciasPublicidad`).
 */
export function MetaPixel() {
  const pathname = usePathname() ?? '/';
  const estado = useEstado();

  useEffect(() => { seguirRuta(pathname); }, [pathname, estado]);

  if (estado !== 'pendiente' || !rutaConPixel(pathname)) return null;
  return (
    <div
      role="region"
      aria-label="Cookies de publicidad"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-t-card border border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[26rem]"
    >
      <p className="text-[14px] leading-relaxed text-foreground">
        Usamos una cookie de Meta para saber qué anuncios nos traen estudios. Solo si aceptas.
        Qué guarda y cómo retirarla, en la{' '}
        <Link href="/cookies" className="underline underline-offset-2">política de cookies</Link>.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" className={BOTON} onClick={() => guardarDecision('no', pathname)}>Rechazar</button>
        <button type="button" className={BOTON} onClick={() => guardarDecision('si', pathname)}>Aceptar</button>
      </div>
    </div>
  );
}

/** Para `/cookies`: retirar o dar el permiso con la misma facilidad que se dio. */
export function PreferenciasPublicidad() {
  const estado = useEstado();
  if (estado === 'servidor' || estado === 'apagado') return null;
  const texto =
    estado === 'si' ? 'Ahora mismo: aceptadas.'
    : estado === 'no' ? 'Ahora mismo: rechazadas.'
    : 'Ahora mismo: sin decidir (no se usa ninguna).';
  return (
    <div className="not-prose my-4 rounded-t-card border border-border bg-card p-4">
      <p className="text-[14px] text-foreground"><strong>Cookie de publicidad de Meta.</strong> {texto}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className={BOTON} onClick={() => guardarDecision('no', '/cookies')}>Rechazar</button>
        <button type="button" className={BOTON} onClick={() => guardarDecision('si', '/cookies')}>Aceptar</button>
      </div>
    </div>
  );
}
