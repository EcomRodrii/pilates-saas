'use client';

import { ExportarDatosEstudio } from '@/components/billing/exportar-datos-estudio';
import { TabExportarExcel } from '@/components/configuracion/tab-exportar-excel';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Datos y seguridad: llévate una copia de tus datos.
//
// ⚠️ Dos exportaciones a la vez, cada una con su frase de qué saca y en qué
// formato (lib/configuracion/secciones.ts): «Exportar mis datos» la hace el
// servidor, un CSV por tabla; «Exportar a Excel» la hace el navegador, tres CSV.
// Está pendiente decidir cuál se queda.
//
// Aquí vivía también una lista de «copias de seguridad» que prometía una copia
// diaria automática que ningún proceso programado hace, y un «Restaurar» que no
// estaba disponible. Se quitó: una pantalla de seguridad que promete lo que no
// hay es peor que no tenerla.
export function SeccionDatos({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TarjetaAjuste id="exportar">
        <ExportarDatosEstudio sinCabecera />
      </TarjetaAjuste>
      <TarjetaAjuste id="integracion-excel">
        <TabExportarExcel showToast={showToast} />
      </TarjetaAjuste>
    </>
  );
}
