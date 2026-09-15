'use client';

import { useRol, puedeGestionarAppsOAuth } from '@/lib/permisos';
import { TabIntegraciones } from '@/components/configuracion/tab-integraciones';
import { TabAppsConectadas } from '@/components/configuracion/tab-apps-conectadas';

const INTEGRACIONES = ['GOOGLE_CALENDAR', 'ZOOM', 'KISI', 'KLAVIYO', 'ZAPIER', 'MAILCHIMP'] as const;

// Conexiones: Tentare con otras herramientas. Stripe, WhatsApp, Gmail y el
// remitente de los correos están en «Cobros y facturas» y «Cómo me comunico».
export function SeccionConexiones({ showToast }: { showToast: (m: string) => void }) {
  const rol = useRol();
  return (
    <TabIntegraciones showToast={showToast} tipos={INTEGRACIONES}>
      {puedeGestionarAppsOAuth(rol) && <TabAppsConectadas showToast={showToast} />}
    </TabIntegraciones>
  );
}
