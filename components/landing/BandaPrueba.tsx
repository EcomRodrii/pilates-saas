'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { ALTA } from '@/components/landing/enlaces';
import { ACC, ACC_SOFT } from '@/components/landing/theme';
import { CLAVE_BANDA_PRUEBA, verBandaPrueba } from '@/lib/landing/banda-prueba-reglas';

// La banda de arriba de la home (encargo del fundador, 9-oct-2026): lo que más
// pesa para quien viene de un anuncio, dicho en una línea y sin tapar nada.
//
// ⚠️ SOLO para quien llega por el enlace del anuncio (`utm_source=meta`); la
// landing normal NO la lleva. La regla vive en lib/landing/banda-prueba-reglas.ts.
// Se decide en el navegador, no en el servidor: leer `searchParams` en la home
// la volvería dinámica (adiós a la caché y al HTML estático que ve Google), y
// así ni el buscador ni quien entra directo reciben nunca esta banda. El HTML del
// servidor sale sin ella; a quien viene del anuncio se le añade al hidratar.
//
// NO es un popup: va en el flujo, se va con el scroll y no se puede cerrar
// porque no estorba.
//
// Las dos frases salen de lo que la web ya prometía y el código sostiene
// (`app/precios/page.tsx`: «¿La migración desde otra plataforma cuesta aparte? —
// No se cobra aparte. Traes tus datos con los asistentes de importación y te
// acompañamos en la puesta en marcha»; y `SeccionConfianza`):
//  · 7 días gratis, sin tarjeta (`TRIAL_DIAS`, prueba local);
//  · migración incluida, sin coste aparte.
// ⚠️ Nada de «migración en 48 h» ni de «lo hacemos nosotros»: no hay plazo
// garantizado y la importación la hace la propietaria con el asistente. Si algún
// día cambia lo que se ofrece, se cambia aquí y en esa pregunta de precios.

const sinSuscripcion = () => () => {};

function leer(): boolean {
  try {
    return verBandaPrueba(window.location.search, window.sessionStorage.getItem(CLAVE_BANDA_PRUEBA));
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): decide solo la URL.
    return verBandaPrueba(window.location.search, null);
  }
}

export function BandaPrueba() {
  // `false` en el servidor y en la hidratación: el HTML estático no lleva la banda.
  const ver = useSyncExternalStore(sinSuscripcion, leer, () => false);

  useEffect(() => {
    if (!ver) return;
    try {
      window.sessionStorage.setItem(CLAVE_BANDA_PRUEBA, '1');
    } catch {
      // Sin almacenamiento: se queda mientras la URL traiga el utm.
    }
  }, [ver]);

  if (!ver) return null;

  return (
    <div className="v5-banda" role="note" aria-label="Oferta de prueba">
      <p className="v5-banda-texto">
        <strong>{TRIAL_DIAS} días gratis, sin tarjeta</strong>
        <span className="v5-banda-sep" aria-hidden> · </span>
        <span>Migración incluida, sin coste aparte</span>
      </p>
      <Link href={ALTA} className="v5-banda-enlace">Empezar <span aria-hidden>→</span></Link>
      <style>{`
        .v5-banda { display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
          gap: 4px 14px; padding: 9px 16px; background: ${ACC}; color: ${ACC_SOFT};
          font-size: 13.5px; line-height: 1.35; text-align: center;
          /* Aire hasta la píldora del menú, que va pegada debajo en el flujo. */
          margin-bottom: 14px; }
        .v5-banda-texto { margin: 0; }
        .v5-banda-texto strong { font-weight: 700; }
        .v5-banda-enlace { color: #D9C29E; font-weight: 700; text-decoration: underline;
          text-underline-offset: 3px; white-space: nowrap; }
        .v5-banda-enlace:hover { filter: brightness(1.1); }
        .v5-banda-enlace:focus-visible { outline: 2px solid #D9C29E; outline-offset: 3px; border-radius: 4px; }
        @media (max-width: 520px) {
          .v5-banda { font-size: 13px; padding: 8px 14px; }
          .v5-banda-sep { display: none; }
          .v5-banda-texto > span:last-child { display: block; }
        }
      `}</style>
    </div>
  );
}
