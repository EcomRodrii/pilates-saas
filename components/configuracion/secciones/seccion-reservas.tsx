'use client';

import { TabEstudioReservas } from '@/components/configuracion/tab-estudio-reservas';

// Cómo reservan mis alumnas. Las tres tarjetas las pinta TabEstudioReservas: la
// explicación de lo guardado, las reglas (un solo formulario con su botón) y el
// aviso a las alumnas, que se guarda aparte.
//
// Dentro de las reglas viven también «Compra desde tu enlace» y «Las
// instructoras crean sus clases», cuyo sitio es «Alta de alumnas» y «Mi
// equipo»: allí hay una fila que trae hasta aquí.
export function SeccionReservas({ showToast }: { showToast: (m: string) => void }) {
  return <TabEstudioReservas showToast={showToast} />;
}
