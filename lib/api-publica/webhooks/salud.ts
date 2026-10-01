// La salud de un webhook tras cada intento, y qué se le cuenta a la propietaria.
// Puro, para probarlo entero.
//
// Tres avisos, y nunca dos veces el mismo por racha (`aviso_fallando_en`):
//   · «tu programa no recibe los avisos»: lleva HORAS_PARA_AVISAR sin entregar
//     nada. Va antes de desactivarlo, para que pueda arreglarlo a tiempo;
//   · «se ha desactivado»: lo apaga Tentare (días sin entregar, o el destino
//     dice 410). Desde ahí, lo que pase no le llega;
//   · «vuelve a recibirlos»: cierra el primero cuando entrega otra vez (todo
//     aviso de problema tiene su aviso de resolución).
// Un fallo suelto que se arregla solo en un rato no avisa a nadie: los
// reintentos están para eso.

import type { ResultadoEnvio } from './envio.ts';
import { esExito, type EfectoEnWebhook } from './reintentos.ts';

export const HORAS_PARA_AVISAR = 12;
export const DIAS_PARA_DESACTIVAR = 3;
/**
 * Si una entrega agota sus reintentos (casi tres días) y el webhook lleva al
 * menos esto sin entregar nada, está muerto: se desactiva ya. Sin esta regla,
 * un estudio con poco movimiento (sin entregas nuevas que lo comprueben) nunca
 * llegaría a los DIAS_PARA_DESACTIVAR y se quedaría fallando para siempre.
 */
export const DIAS_PARA_DESACTIVAR_AL_AGOTAR = 2;

export type MotivoDesactivacion = 'fallos' | 'destino_retirado';
export type Aviso = 'fallando' | 'desactivado' | 'recuperado';

export interface SaludAntes { fallandoDesde: string | null; avisoFallandoEn: string | null }

export interface SaludDespues {
  fallandoDesde: string | null;
  avisoFallandoEn: string | null;
  desactivar: MotivoDesactivacion | null;
  /** Lo que hay que contarle a la propietaria tras ESTE intento. */
  aviso: Aviso | null;
}

const DIA = 86_400_000;

export function saludTrasIntento(antes: SaludAntes, r: ResultadoEnvio, efecto: EfectoEnWebhook, ahora: Date): SaludDespues {
  if (esExito(r)) {
    return {
      fallandoDesde: null,
      avisoFallandoEn: null,
      desactivar: null,
      aviso: antes.avisoFallandoEn ? 'recuperado' : null,
    };
  }
  const fallandoDesde = antes.fallandoDesde ?? ahora.toISOString();
  const lleva = ahora.getTime() - Date.parse(fallandoDesde);
  const desactivar: MotivoDesactivacion | null =
    efecto === 'desactivar_destino_retirado' ? 'destino_retirado'
      : lleva >= DIAS_PARA_DESACTIVAR * DIA ? 'fallos'
        : efecto === 'agotado' && lleva >= DIAS_PARA_DESACTIVAR_AL_AGOTAR * DIA ? 'fallos'
          : null;
  if (desactivar) {
    return { fallandoDesde, avisoFallandoEn: antes.avisoFallandoEn, desactivar, aviso: 'desactivado' };
  }
  const tocaAvisar = !antes.avisoFallandoEn && lleva >= HORAS_PARA_AVISAR * 3_600_000;
  return {
    fallandoDesde,
    avisoFallandoEn: tocaAvisar ? ahora.toISOString() : antes.avisoFallandoEn,
    desactivar: null,
    aviso: tocaAvisar ? 'fallando' : null,
  };
}

/** Por qué se desactivó, en palabras de la propietaria (para el aviso). */
export function porQueSeDesactivo(motivo: MotivoDesactivacion): string {
  return motivo === 'destino_retirado'
    ? 'tu programa respondió que esa dirección ya no existe'
    : 'llevaba días sin poder entregar ningún aviso';
}
