'use client';

import { TabEstudioReservas } from '@/components/configuracion/tab-estudio-reservas';

// Cómo reservan mis alumnas. Las tarjetas y su barra de guardar las pinta
// TabEstudioReservas: la explicación de lo guardado, las cinco de reglas (una
// sola barra para todas) y el aviso a las alumnas, que se guarda aparte.
export function SeccionReservas({ showToast }: { showToast: (m: string) => void }) {
  return <TabEstudioReservas showToast={showToast} />;
}
