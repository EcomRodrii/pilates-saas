'use client';

import { CodigosDescuento } from '@/components/decision/codigos-descuento';

// Vivía en Centro de Control solo porque el módulo Marketing —única UI
// pensada para codigos_descuento— está congelado (auditoría de arquitectura,
// 22-sep-2026): diluía la pantalla de "un solo mensaje" con un CRUD que no es
// una decisión del Umbral. El mismo componente, sin cambios, ahora vive en su
// sitio natural de Configuración.
export function HerramientaCodigosDescuento({ showToast }: { showToast: (m: string) => void }) {
  return <CodigosDescuento onToast={showToast} />;
}
