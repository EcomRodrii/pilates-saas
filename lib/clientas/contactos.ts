// Un CONTACTO apuntado a mano: «la llamé», «le escribí por WhatsApp», «hablé
// con ella en el estudio». Vive en `comunicaciones_socio` con `tipo =
// 'contacto'` (migr …_comunicaciones_socio_contactos), junto a los correos que
// le manda el sistema: así su historia, su supresión (RGPD) y su exportación
// los tratan igual sin tabla nueva.
//
// Para qué: que el equipo sepa quién habló con ella, cuándo y qué dijo, y que
// el Centro de Control deje de proponer «escríbele» a quien acaban de llamar
// (lib/decision/senales.ts, diasDesdeUltimoContacto) — o de insistir con quien
// dijo que no quiere seguir.
//
// Puro: lo usan la ruta (validar), la ficha (textos) y los tests.

export const CANALES_CONTACTO = ['WHATSAPP', 'LLAMADA', 'EN_PERSONA', 'EMAIL'] as const;
export type CanalContacto = (typeof CANALES_CONTACTO)[number];

export const RESULTADOS_CONTACTO = ['VA_A_VOLVER', 'SE_LO_PIENSA', 'NO_CONTESTA', 'NO_QUIERE_SEGUIR'] as const;
export type ResultadoContacto = (typeof RESULTADOS_CONTACTO)[number];

export const ETIQUETA_CANAL: Record<CanalContacto, string> = {
  WHATSAPP: 'WhatsApp',
  LLAMADA: 'Llamada',
  EN_PERSONA: 'En el estudio',
  EMAIL: 'Correo',
};

export const ETIQUETA_RESULTADO: Record<ResultadoContacto, string> = {
  VA_A_VOLVER: 'Va a volver',
  SE_LO_PIENSA: 'Se lo piensa',
  NO_CONTESTA: 'No contesta',
  NO_QUIERE_SEGUIR: 'No quiere seguir',
};

/** Largo máximo de la nota (el CHECK de la tabla dice lo mismo). */
export const NOTA_CONTACTO_MAX = 1000;
/** Un contacto se puede apuntar con fecha de hasta hace estos días (lo de ayer que se olvidó). */
export const DIAS_ATRAS_CONTACTO = 7;
/** Margen hacia el futuro, por relojes de móvil un poco adelantados. */
const MARGEN_FUTURO_MS = 2 * 60_000;

export interface ContactoValido {
  canal: CanalContacto;
  resultado: ResultadoContacto | null;
  nota: string | null;
  /** Instante del contacto (ISO). */
  en: string;
}

export type ResultadoValidacion = { ok: true; contacto: ContactoValido } | { ok: false; error: string };

/** Valida lo que llega del navegador. `ahora` se inyecta para poder probarlo. */
export function validarContacto(cuerpo: unknown, ahora: Date): ResultadoValidacion {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>;
  const canal = CANALES_CONTACTO.find(x => x === c.canal);
  if (!canal) return { ok: false, error: 'Elige cómo fue el contacto: WhatsApp, llamada, en persona o correo.' };

  let resultado: ResultadoContacto | null = null;
  if (c.resultado !== undefined && c.resultado !== null && c.resultado !== '') {
    const r = RESULTADOS_CONTACTO.find(x => x === c.resultado);
    if (!r) return { ok: false, error: 'Ese resultado no existe.' };
    resultado = r;
  }

  let nota: string | null = null;
  if (c.nota !== undefined && c.nota !== null) {
    if (typeof c.nota !== 'string') return { ok: false, error: 'La nota tiene que ser texto.' };
    const limpia = c.nota.trim();
    if (limpia.length > NOTA_CONTACTO_MAX) return { ok: false, error: `La nota no puede pasar de ${NOTA_CONTACTO_MAX} caracteres.` };
    nota = limpia || null;
  }

  let en = ahora.toISOString();
  if (c.en !== undefined && c.en !== null && c.en !== '') {
    const t = typeof c.en === 'string' ? Date.parse(c.en) : NaN;
    if (Number.isNaN(t)) return { ok: false, error: 'La fecha no es válida.' };
    if (t > ahora.getTime() + MARGEN_FUTURO_MS) return { ok: false, error: 'No se puede apuntar un contacto en el futuro.' };
    if (t < ahora.getTime() - DIAS_ATRAS_CONTACTO * 86_400_000) {
      return { ok: false, error: `Solo se puede apuntar un contacto de los últimos ${DIAS_ATRAS_CONTACTO} días.` };
    }
    en = new Date(t).toISOString();
  }

  return { ok: true, contacto: { canal, resultado, nota, en } };
}

/** El «asunto» con que queda en `comunicaciones_socio`: «Llamada · Se lo piensa». */
export function asuntoDeContacto(canal: CanalContacto, resultado: ResultadoContacto | null): string {
  return resultado ? `${ETIQUETA_CANAL[canal]} · ${ETIQUETA_RESULTADO[resultado]}` : ETIQUETA_CANAL[canal];
}

export interface ContactoApuntado {
  id: string;
  canal: CanalContacto;
  resultado: ResultadoContacto | null;
  nota: string | null;
  /** ISO. */
  en: string;
  /** Cuenta de quien lo apuntó (para poder borrarlo ella), y su nombre para pintarlo. */
  autorUid: string | null;
  autorNombre: string | null;
}

/**
 * ¿Ya se ha hablado con ella después de que saltara el aviso? Entonces el aviso
 * está atendido: el Centro de Control lo retira solo en su siguiente pasada
 * (calcularExpiraciones), y hasta entonces la pantalla no lo pinta como algo
 * pendiente. `desde`: cuándo saltó el aviso (ISO); sin fecha, cualquier contacto
 * de los últimos 14 días vale.
 */
export function contactoTrasElAviso(
  contactos: readonly Pick<ContactoApuntado, 'en'>[],
  desde: string | null,
  ahora: Date,
): boolean {
  const limite = desde ?? new Date(ahora.getTime() - 14 * 86_400_000).toISOString();
  return contactos.some(c => c.en >= limite);
}
