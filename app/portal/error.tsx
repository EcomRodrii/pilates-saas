'use client';

// Error boundary de la app de la alumna UN NIVEL POR ENCIMA del estudio.
//
// Existe por un caso concreto: `app/portal/[slug]/layout.tsx` lanza cuando el
// estudio no se puede LEER (base de datos inaccesible, esquema desincronizado,
// service-role ausente). Un `error.tsx` no envuelve el layout de su mismo
// segmento (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md),
// así que `app/portal/[slug]/error.tsx` no lo veía y el fallo subía hasta
// `app/global-error.tsx`: la pantalla genérica oscura de la web, que dentro de la
// app de iOS parece que se ha roto la app entera. Aquí sale la de la app, con
// «Volver a intentarlo».
//
// ⚠️ El layout que ha fallado es el que carga `student.css` y pinta
// `.student-app`, así que se cargan aquí: sin ellos esta pantalla no tendría ni
// la tipografía ni los colores de la app (los del kit, porque el tema del
// estudio tampoco se llegó a inyectar).

import './[slug]/student.css';
import { PantallaErrorPortal } from '@/components/student/PantallaErrorPortal';

export default function ErrorPortal({
  error, retry, reset,
}: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  return (
    <div className="student-app">
      <PantallaErrorPortal error={error} onReintentar={() => (retry ?? reset)()} operacion="cargar-estudio" />
    </div>
  );
}
