// ─────────────────────────────────────────────────────────────────────────────
// ¿Esta integración funciona AHORA MISMO?
//
// La pantalla de Integraciones decía «conectado» cuando había un token
// guardado. Eso no es el estado de la integración: es el estado del
// formulario. Un token de Meta caducado o revocado deja «conectado» en pantalla
// para siempre mientras el cron de recordatorios va sumando fallos en un log
// que no mira nadie — justo la «integración de mentira» que hay que quitar de
// en medio: un indicador que cambia de color sin haber hablado con nadie.
//
// Aquí se decide qué se enseña a partir de HECHOS: la última vez que el
// servicio respondió bien y la última vez que falló. Nada más. Puro y con
// tests, porque es la diferencia entre avisar a tiempo y no avisar nunca.
// ─────────────────────────────────────────────────────────────────────────────

import { TZ_ESTUDIO } from '../utils.ts';

export interface FilaSalud {
  activo: boolean;
  ultimoOkEn: string | null;
  ultimoError: string | null;
  ultimoErrorEn: string | null;
}

export type SaludIntegracion =
  /** Ni siquiera está encendida. No se afirma nada sobre el servicio. */
  | { estado: 'APAGADA' }
  /**
   * Encendida, pero todavía no se ha hablado con el servicio. Es un estado
   * REAL y distinto de «funciona»: es lo que hay justo después de pegar un
   * token, y decir «conectado» ahí es precisamente la mentira que había.
   */
  | { estado: 'SIN_PROBAR' }
  | { estado: 'FUNCIONA'; desde: string }
  /** Falló después del último éxito (o nunca hubo éxito). */
  | { estado: 'FALLANDO'; desde: string; error: string };

/**
 * El estado a partir de la fila.
 *
 * ⚠️ Gana el más RECIENTE, no el error. Una integración que falló ayer y hoy ha
 * mandado bien está funcionando: dejarla en rojo por un fallo viejo enseña a la
 * propietaria a ignorar el aviso, y entonces tampoco verá el que importa.
 */
export function saludIntegracion(fila: FilaSalud | null | undefined): SaludIntegracion {
  if (!fila || !fila.activo) return { estado: 'APAGADA' };
  const { ultimoOkEn, ultimoError, ultimoErrorEn } = fila;
  if (!ultimoOkEn && !ultimoErrorEn) return { estado: 'SIN_PROBAR' };
  const fallaDespues = !!ultimoErrorEn && (!ultimoOkEn || ultimoErrorEn > ultimoOkEn);
  if (fallaDespues) {
    return {
      estado: 'FALLANDO',
      desde: ultimoErrorEn!,
      // Sin mensaje del servicio no se inventa uno técnico: se dice lo único
      // que se sabe con certeza.
      error: (ultimoError ?? '').trim() || 'El servicio rechazó la última petición',
    };
  }
  return { estado: 'FUNCIONA', desde: ultimoOkEn! };
}

/**
 * «18 ago, 14:03» en la hora del estudio.
 *
 * Absoluta y no «hace 3 horas» a propósito: una antigüedad relativa necesita un
 * reloj, y un reloj en render no sobrevive al SSR (el servidor pinta una cifra
 * y el cliente otra). Además, para decidir si el token murió anoche o hace un
 * mes, la fecha exacta dice más que «hace mucho».
 */
export function cuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: TZ_ESTUDIO,
  });
}

/**
 * La frase de la tarjeta. Devuelve también `tono` para que la pantalla no
 * tenga que volver a razonar sobre el estado.
 */
export function textoSalud(
  salud: SaludIntegracion,
): { tono: 'neutro' | 'ok' | 'error'; texto: string } | null {
  switch (salud.estado) {
    case 'APAGADA':
      return null;
    case 'SIN_PROBAR':
      return { tono: 'neutro', texto: 'Guardada, pero aún sin usar — pulsa «Probar conexión»' };
    case 'FUNCIONA':
      return { tono: 'ok', texto: `Funcionando · última vez el ${cuando(salud.desde)}` };
    case 'FALLANDO':
      // El mensaje del servicio va DENTRO: «revisa la configuración» no le dice
      // a nadie si el problema es el token, el número o la plantilla.
      return { tono: 'error', texto: `Sin funcionar desde el ${cuando(salud.desde)} · ${salud.error}` };
  }
}

/**
 * Acumulador para un bucle de envíos: se queda con el ÚLTIMO error y con si
 * hubo algún acierto. Vive aquí y no suelto en el cron para que el criterio
 * ("un solo acierto basta para decir que el canal funciona") sea el mismo
 * dondequiera que se use.
 *
 * ⚠️ Un acierto GANA a los fallos de la misma tanda a propósito: si el token
 * vale y solo rebotan tres números mal escritos, la integración no está caída
 * — el problema es de esos contactos, y pintar la tarjeta en rojo mandaría a
 * la propietaria a revisar un token que está perfectamente.
 */
export function acumuladorSalud() {
  let huboOk = false;
  let ultimoError: string | null = null;
  return {
    anota(res: { ok: true } | { ok: false; error: string }) {
      if (res.ok) huboOk = true;
      else ultimoError = res.error;
    },
    /** `null` si no se intentó nada: entonces no hay nada nuevo que guardar. */
    resultado(): { ok: true } | { ok: false; error: string } | null {
      if (huboOk) return { ok: true };
      if (ultimoError !== null) return { ok: false, error: ultimoError };
      return null;
    },
  };
}
