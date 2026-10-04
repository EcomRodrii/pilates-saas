'use client';

// Error boundary de las PANTALLAS de la alumna (el layout del estudio sigue
// montado: su tema, sus avisos).
//
// ⚠️ NO recoge el fallo del propio layout (`app/portal/[slug]/layout.tsx` lanza
// cuando el estudio no se puede LEER): un `error.tsx` no envuelve el layout de
// su mismo segmento. Ese lo recoge `app/portal/error.tsx`, un nivel arriba, con
// la misma pantalla (`PantallaErrorPortal`). Antes subía hasta
// `app/global-error.tsx` y la alumna veía la pantalla genérica oscura de la web.
//
// No hay `loading.tsx` hermano a propósito: el shell ya pinta esqueletos por
// pantalla (`States.tsx`), y un loading de segmento entero haría desaparecer la
// cabecera y la nav en cada navegación, que es lo contrario de sentirse app.

import { PantallaErrorPortal } from '@/components/student/PantallaErrorPortal';

export default function ErrorPortalStudent({
  error, retry, reset,
}: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  // `retry` (Next 16.3) vuelve a PEDIR la pantalla al servidor; `reset` solo la
  // vuelve a pintar con lo que ya había, que para un fallo de servidor no sirve.
  return <PantallaErrorPortal error={error} onReintentar={() => (retry ?? reset)()} operacion="cargar-pantalla" />;
}
