'use client';

// Boundary compartido para las pantallas públicas de token que llegan por
// email (confirmar reserva, aceptar sustitución, valorar, avisar baja,
// disponibilidad) — auditoría 2026-09-16, FE-9.
//
// Sin esto, un fallo de red/BD en el Server Component (todas hacen
// `await admin.from(...)`) caía al `error.tsx` raíz, que reemplaza
// `<html>`/`<body>` enteros sin `globals.css` ni marca: la socia pulsa el
// enlace de SU estudio y aterriza en una pantalla negra genérica de otra
// empresa — en un producto white-label, el peor momento posible para eso.
//
// Mismo lenguaje visual que el `Aviso` que cada página ya pinta para "token
// inválido" (tarjeta blanca sobre fondo neutro, icono en círculo con
// `IconoDesenlace`), así que un fallo real y un token caducado se VEN igual —
// coherente, y sin depender del tema del estudio (aquí no hay ninguno cargado).
import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { capturarExcepcion } from '@/lib/sentry-cliente';

export function AvisoErrorToken({
  error, area,
}: {
  error: Error & { digest?: string };
  /** Tag de Sentry para distinguir qué pantalla de token falló. */
  area: string;
}) {
  useEffect(() => {
    console.error(`[${area}]`, error);
    // Sin esta línea el fallo NO llega a Sentry: en cuanto un error.tsx de
    // segmento atrapa, app/global-error.tsx ya no se monta y deja de reportar
    // — la trampa que ya documenta app/reservar/[slug]/error.tsx.
    capturarExcepcion(error, { tags: { area }, extra: { digest: error.digest } });
  }, [error, area]);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <AlertCircle size={26} aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">No hemos podido cargar esta página</h1>
        <p className="mt-2 text-sm text-slate-500">Parece un problema temporal. Vuelve a abrir el enlace en unos segundos.</p>
      </div>
    </main>
  );
}
