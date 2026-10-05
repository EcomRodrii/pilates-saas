'use client';

// La pantalla de «no hemos podido cargar» de la app de la alumna, compartida
// por sus DOS límites de error:
//
//   · app/portal/[slug]/error.tsx — falla una pantalla; el layout (tema del
//     estudio, avisos) sigue montado.
//   · app/portal/error.tsx — falla el LAYOUT del estudio (no se pudo leer el
//     estudio). Un `error.tsx` no recoge los errores del layout de su mismo
//     segmento (node_modules/next/dist/docs/…/error.md), así que ese fallo
//     subía hasta app/global-error.tsx, la pantalla genérica oscura de la web:
//     dentro de la app de iOS parecía que se había roto la app entera.
//
// Los colores van con `var(--token, literal)`: en el segundo caso el tema del
// estudio no se ha llegado a inyectar, y esta pantalla tiene que leerse igual.

import { useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
// Por `lib/sentry-cliente` y no `@sentry/nextjs` directo: este boundary se carga
// con TODAS las pantallas del portal, y un import estático del SDK metía ~20 KB
// comprimidos en el camino crítico, anulando la carga diferida de Sentry.
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { Icono } from '@/components/student/ui/Icono';

export function PantallaErrorPortal({ error, onReintentar, operacion }: {
  error: Error & { digest?: string };
  onReintentar: () => void;
  /** Para Sentry: qué falló (la pantalla o el estudio entero). */
  operacion: 'cargar-pantalla' | 'cargar-estudio';
}) {
  const ruta = usePathname();
  const params = useParams<{ slug?: string }>();
  const slug = params?.slug;

  useEffect(() => {
    // El contexto que hace depurable esto: qué operación y qué estudio, sin
    // PII de la alumna. `digest` es el identificador que Next enseña en
    // producción, y sin él un informe de Sentry no se puede cruzar con el log.
    capturarExcepcion(error, {
      // ⚠️ Nada de PII. El slug es PÚBLICO (va en la URL que cualquiera puede
      // ver) y es lo que permite saber a QUÉ estudio le está pasando; el email
      // o el id de la socia no añadirían nada que no se pueda cruzar por el
      // `digest`, y sí serían datos personales en un servicio de terceros.
      tags: { area: 'student-pwa', operacion, estudio: slug ?? '' },
      extra: { digest: error.digest, ruta },
    });
  }, [error, ruta, slug, operacion]);

  // ⚠️ Una sola copia, y NEUTRA a propósito. Next borra el mensaje de los
  // errores de servidor antes de que lleguen al cliente en producción, así que
  // elegir el texto por `error.message` era siempre falso (visto en Sentry el
  // 8-sep). Y este límite recoge cualquier pantalla del segmento: decir «no
  // hemos podido cargar tu estudio» cuando ha fallado otra cosa sería mentir, y
  // prometer «no ha afectado a tus reservas» es algo que aquí no se puede saber.
  return (
    <div
      data-testid="error-portal"
      style={{
        minHeight: '100dvh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: '32px 24px', textAlign: 'center',
        background: 'var(--background, #FAF9F5)', color: 'var(--foreground, #1A1A1A)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 52, height: 52, borderRadius: 999, display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--muted, #EFEDE4)', color: 'var(--foreground, #1A1A1A)',
        }}
      >
        <Icono nombre="alerta" tamano={24} />
      </span>

      <h1 style={{ margin: 0, fontSize: 'var(--t-h1, 25px)', fontFamily: 'var(--font-heading, inherit)', fontWeight: 'var(--heading-weight, 800)', letterSpacing: '-.02em' }}>
        No hemos podido cargar esta pantalla
      </h1>

      <p style={{ margin: 0, fontSize: 'var(--t-body, 13.5px)', lineHeight: 1.55, maxWidth: '32ch', color: 'var(--muted-foreground, #5A5A52)' }}>
        Es un problema nuestro, no tuyo. Vuelve a intentarlo en un momento; si sigue pasando, escríbenos y lo miramos.
      </p>

      <button
        type="button"
        onClick={onReintentar}
        style={{
          marginTop: 6, height: 48, padding: '0 26px', borderRadius: 999, border: 'none',
          cursor: 'pointer', fontSize: 'var(--t-body, 13.5px)', fontWeight: 800, fontFamily: 'inherit',
          background: 'var(--primary, #1A1A1A)', color: 'var(--primary-foreground, #F1ECE1)',
        }}
      >
        Volver a intentarlo
      </button>
    </div>
  );
}
