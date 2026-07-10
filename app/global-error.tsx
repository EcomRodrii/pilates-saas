'use client'; // Los error boundaries tienen que ser Client Components.

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Último cortafuegos: captura los errores que rompen hasta el root layout (los
// que ni error.tsx de un segmento atrapan). Sin esto, un fallo de render en el
// cliente no llega a Sentry — justamente el punto ciego que queremos cerrar.
//
// Al reemplazar al root layout, este componente debe traer sus propios <html> y
// <body>, y no puede apoyarse en globals.css ni en las fuentes: van estilos
// inline para que se vea decente aunque la app se haya caído entera.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#0d0f12',
          color: '#e8eaed',
        }}
      >
        <main style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Algo se ha roto
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#9aa0a6', margin: '0 0 24px' }}>
            Hemos registrado el fallo y ya lo estamos revisando. Puedes reintentar;
            si sigue sin funcionar, prueba de nuevo en unos minutos.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              background: '#e8eaed',
              color: '#0d0f12',
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
