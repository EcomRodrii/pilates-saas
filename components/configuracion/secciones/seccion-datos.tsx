'use client';

import { ExportarDatosEstudio } from '@/components/billing/exportar-datos-estudio';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Datos y seguridad: llévate una copia de tus datos.
//
// Una sola forma de llevártelos (decisión del fundador, 15-sep): «Exportar mis
// datos», un CSV por tabla hecho en el servidor. La exportación rápida «Exportar
// a Excel» (tres CSV hechos en el navegador con lo cargado en el panel) se
// retiró: dos botones para lo mismo obligaban a adivinar cuál era el bueno. Su
// ancla vieja, `#integracion-excel`, lleva aquí (lib/configuracion/destino.ts).
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
