'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «N alumnas no pueden entrar a tu app», arriba de Clientas. Sin correo en la
// ficha no hay acceso a la app ni avisos (lib/clientas/sin-correo.ts decide a
// quién se cuenta y cuándo se avisa). Dos salidas, las dos reales:
//   · «Ver quiénes» filtra la lista por ese mismo corte (el número de aquí es el
//     de las filas que enseña);
//   · el enlace de su app, para que se registren ellas solas con su correo
//     (así entraron las 61 alumnas de un estudio en cuatro días).
// Se puede cerrar; vuelve a salir si aparecen cinco o más sin correo que cuando
// se cerró, o si es otra persona la que mira desde otro navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { MailX, X } from 'lucide-react';
import { alumnas } from '@/lib/clientas/sin-correo';

const SALTO_PARA_VOLVER = 5;
const clave = (studioId: string) => `tentare-aviso-sin-correo:${studioId}`;

function leerCerrado(studioId: string): number {
  try {
    const v = Number(localStorage.getItem(clave(studioId)));
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}

export function AvisoSinCorreo({ studioId, n, onVer }: {
  studioId: string;
  /** Cuántas alumnas que viven en el estudio no tienen correo. */
  n: number;
  /** Filtra la lista por ellas. */
  onVer: () => void;
}) {
  const [cerradoCon, setCerradoCon] = useState(() => (typeof window === 'undefined' ? 0 : leerCerrado(studioId)));
  if (cerradoCon > 0 && n < cerradoCon + SALTO_PARA_VOLVER) return null;

  function cerrar() {
    setCerradoCon(n);
    try { localStorage.setItem(clave(studioId), String(n)); } catch { /* solo en esta carga */ }
  }

  return (
    <section
      role="status"
      aria-label="Alumnas sin correo"
      data-testid="aviso-sin-correo"
      className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3"
    >
      <MailX size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-foreground">
          {alumnas(n)} {n === 1 ? 'no puede' : 'no pueden'} entrar a tu app
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground text-pretty">
          Sin correo en su ficha no pueden reservar desde el móvil ni reciben tus avisos. Pídeselo, o mándales el enlace de tu app para que se registren ellas solas.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <button type="button" onClick={onVer} className="text-[13px] font-semibold text-foreground underline underline-offset-2 hover:no-underline">
            Ver quiénes son
          </button>
          <Link href="/configuracion?tab=web#direccion-y-enlaces" className="text-[13px] font-semibold text-brand-medio hover:underline">
            Copiar el enlace de mi app
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar el aviso"
        className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X size={15} aria-hidden />
      </button>
    </section>
  );
}
