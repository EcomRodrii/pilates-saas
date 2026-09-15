'use client';

import { ExportarDatosEstudio } from '@/components/billing/exportar-datos-estudio';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Datos y seguridad: llévate una copia de tus datos.
//
// Aquí vivía también una lista de «copias de seguridad» que prometía una copia
// diaria automática que ningún proceso programado hace, y un «Restaurar» que no
// estaba disponible. Se quitó: una pantalla de seguridad que promete lo que no
// hay es peor que no tenerla.
export function SeccionDatos(_props: { showToast: (m: string) => void }) {
  return (
    <TarjetaAjuste id="exportar">
      <ExportarDatosEstudio sinCabecera />
    </TarjetaAjuste>
  );
}
