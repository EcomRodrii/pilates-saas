// La cara del asistente: qué estado del motor pone Tenti en cada «momento» de
// una pregunta (spec del asistente, §5.3). El panel habla en momentos
// (lib/asistente/estado-ui.ts) y nunca nombra un estado del motor: la
// traducción vive aquí, en lib/tenti/, donde la vigila la guardia
// (lib/tenti/donde-vive-tenti.test.ts), y la usa SOLO
// components/tenti/tenti-asistente.tsx.

import type { EstadoTenti } from './motor.ts';
import type { MomentoAsistente } from '../asistente/estado-ui.ts';

export const ESTADO_DEL_MOMENTO: Readonly<Record<MomentoAsistente, EstadoTenti>> = {
  listo: 'reposo',
  esperando: 'pensando',
  consultando: 'buscando',
  respondiendo: 'pensando',
  terminado: 'hecho',
  aclarando: 'pregunta',
  fallo: 'error',
};

/** «Hecho» es breve (§12.3): pasado esto vuelve a reposo, sin celebración larga. */
export const MS_HECHO = 1500;

/**
 * Tope de animación: 'buscando' escanea SIN FIN (un fotograma por refresco
 * mientras dure). Una consulta lenta no puede tener a Tenti a 60 fps: pasado
 * esto se queda en 'pensando', que duerme entre parpadeos.
 */
export const MS_MAX_BUSCANDO = 4000;

/** El estado que se pinta: el del momento, salvo 'buscando' pasado su tope. */
export function estadoParaPintar(momento: MomentoAsistente, buscandoAgotado: boolean): EstadoTenti {
  const e = ESTADO_DEL_MOMENTO[momento];
  return e === 'buscando' && buscandoAgotado ? 'pensando' : e;
}
