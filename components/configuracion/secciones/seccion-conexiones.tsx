'use client';

import { useRol, puedeGestionarAppsOAuth } from '@/lib/permisos';
import { TabIntegraciones } from '@/components/configuracion/tab-integraciones';
import { TarjetaEnlace } from '@/components/configuracion/shell/tarjeta-enlace';

// Conexiones: Tentare con otras herramientas.
//
// ⚠️ TabIntegraciones se pinta entero aquí, incluidos Stripe, WhatsApp, Gmail
// y el remitente de los correos, que tienen su sitio en «Cobros y facturas» y
// «Cómo me comunico» (allí hay una fila que trae hasta aquí).
export function SeccionConexiones({ showToast }: { showToast: (m: string) => void }) {
  const rol = useRol();
  return (
    <>
      <TabIntegraciones showToast={showToast} />
      {/* Mismo criterio que la tarjeta a la que lleva (AppsConectadas). */}
      {puedeGestionarAppsOAuth(rol) && <TarjetaEnlace id="aplicaciones-con-acceso" />}
    </>
  );
}
