'use client';

import { SuscripcionVista } from '@/components/billing/suscripcion-vista';

// Suscripción suelta: la pantalla a la que va un estudio BLOQUEADO y a la que vuelve Stripe tras
// pagar. Todo lo demás vive en Configuración → Plan (misma vista, `embebida`).
export default function SuscripcionPage() {
  return <SuscripcionVista />;
}
