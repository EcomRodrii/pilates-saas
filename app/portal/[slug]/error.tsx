'use client';

// Error boundary del segmento de la alumna.
//
// Existe por un caso concreto: el layout lanza cuando el estudio no se puede
// LEER (base de datos inaccesible, esquema desincronizado, service-role
// ausente). Antes eso caía en `notFound()` y la clienta veía «esta página no
// existe» — un 404 que se comparte, se indexa y no invita a reintentar. Aquí
// ve que ha fallado la carga y tiene un botón.
//
// No hay `loading.tsx` hermano a propósito: el shell ya pinta esqueletos por
// pantalla (`States.tsx`), y un loading de segmento entero haría desaparecer la
// cabecera y la nav en cada navegación, que es lo contrario de sentirse app.
//
// Cae en el CSS del kit (`student.css`, cargado por el layout) — pero el layout
// es justo lo que ha fallado, así que los colores van con `var(--token, literal)`
// para que esta pantalla siga siendo legible aunque el tema no se haya inyectado.

import { useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';

export default function ErrorPortalStudent({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  const ruta = usePathname();
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    // El contexto que hace depurable esto: qué operación y qué estudio, sin
    // PII de la alumna. `digest` es el identificador que Next enseña en
    // producción, y sin él un informe de Sentry no se puede cruzar con el log.
    Sentry.captureException(error, {
      // ⚠️ Nada de PII. El slug es PÚBLICO (va en la URL que cualquiera puede
      // ver) y es lo que permite saber a QUÉ estudio le está pasando; el email
      // o el id de la socia no añadirían nada que no se pueda cruzar por el
      // `digest`, y sí serían datos personales en un servicio de terceros.
      tags: { area: 'student-pwa', operacion: 'cargar-estudio', estudio: slug },
      extra: { digest: error.digest, ruta },
    });
  }, [error, ruta, slug]);

  // ⚠️ Aquí había un `error.message === 'STUDENT_ESTUDIO_NO_DISPONIBLE'` para
  // elegir la copia. En producción era SIEMPRE falso: Next borra el mensaje de
  // los errores de servidor antes de que lleguen al boundary del cliente («The
  // specific message is omitted in production builds…»), y así se vio en Sentry
  // el 8-sep, con los mismos sellos de tiempo que los 17 errores del servidor.
  // Las socias reales nunca leyeron la copia escrita para ellas: veían el
  // genérico. Se deja UNA sola copia, y es NEUTRA a propósito: este boundary no
  // recoge solo el fallo del layout, recoge las 29 pantallas del segmento (no
  // hay ningún `error.tsx` anidado). Decir «no hemos podido cargar tu estudio»
  // cuando lo que ha fallado es la pantalla de comunidad sería mentir, y
  // prometer «no ha afectado a tus reservas» es algo que aquí no se puede
  // saber.

  return (
    <div
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
          justifyContent: 'center', fontSize: 24,
          background: 'var(--muted, #EFEDE4)',
        }}
      >
        ⚠
      </span>

      <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 800, letterSpacing: '-.02em' }}>
        No hemos podido cargar esta pantalla
      </h1>

      <p style={{ margin: 0, fontSize: 'var(--t-body)', lineHeight: 1.55, maxWidth: '32ch', color: 'var(--muted-foreground, #5A5A52)' }}>
        Es un problema nuestro, no tuyo. Vuelve a intentarlo en un momento; si sigue pasando, escríbenos y lo miramos.
      </p>

      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 6, height: 48, padding: '0 26px', borderRadius: 999, border: 'none',
          cursor: 'pointer', fontSize: 'var(--t-body)', fontWeight: 800, fontFamily: 'inherit',
          background: 'var(--primary, #1A1A1A)', color: 'var(--primary-foreground, #F1ECE1)',
        }}
      >
        Volver a intentarlo
      </button>
    </div>
  );
}
