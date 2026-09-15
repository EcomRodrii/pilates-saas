// Las reglas de los créditos de Motivación, como formularios de cajón (15-sep, v2).
//
// Se guardaban al salir de cada campo: teclear el nombre, salir, y ya estaba
// escrito, sin un «Guardar» ni forma de arrepentirse. Ahora son dos cajones con
// un solo «Guardar» cada uno, y aquí vive lo que decide QUÉ se escribe:
//   · solo lo que cambia de verdad respecto a lo guardado, ya normalizado (el
//     nombre «créditos» es NULL, 0 meses es «no caducan»), para que tocar un
//     campo y dejarlo igual no escriba nada;
//   · regla a regla, las de «Créditos por acción»: una fila de `reward_rules` por
//     disparador, y solo las que cambian.
//
// ⚠️ Sin regla guardada NO se da ningún crédito (las funciones que los otorgan
// buscan una regla activa: `reglaActivaPara` y las RPC de reward_rules). La
// pantalla de antes la pintaba ENCENDIDA con la cifra sugerida; aquí sale
// apagada, con esa cifra lista para cuando la encienda.
//
// Pura y sin `@/`: se prueba con `node --test`.

import { REWARD_TRIGGERS } from '../engines/reward-engine.ts';
import { normalizarNombreCreditos } from '../creditos-nombre.ts';
import type { RewardRule, RewardTrigger, Studio } from '../types.ts';

/**
 * Valores de partida sugeridos: un punto de arranque, no un límite.
 * ⚠️ Por compra los créditos van POR IMPORTE, no por suceso, y la RPC usa
 * `unidad_euros = 1 €` cuando está vacío: con la sugerencia alta de los demás,
 * encender esa regla daría 10 créditos POR EURO. 1 por euro es legible.
 */
export const CREDITOS_SUGERIDOS: Readonly<Record<string, number>> = {
  ASISTENCIA_CLASE: 10,
  RENOVACION_PLAN: 40,
  REFERIDO_AMIGO: 100,
  SEMANA_COMPLETA: 30,
  PRIMERA_RESERVA: 20,
  OBJETIVO_MENSUAL: 50,
  COMPRA: 1,
};

/** Un entero positivo, o `null`: vacío, 0 o algo que no es un número. */
export function enteroPositivo(texto: string): number | null {
  const n = Number.parseInt(texto.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ─── Cómo funcionan tus créditos (columnas de `studios`) ────────────────────

type ColumnasCreditos = Pick<Studio, 'creditosNombre' | 'creditosCaducanMeses' | 'rachaClasesSemana'>;

export interface ReglasCreditosForm {
  nombre: string;
  caducanMeses: string;
  rachaClases: string;
}

export function reglasCreditosAFormulario(s: Partial<ColumnasCreditos> | null | undefined): ReglasCreditosForm {
  return {
    nombre: s?.creditosNombre ?? '',
    caducanMeses: s?.creditosCaducanMeses ? String(s.creditosCaducanMeses) : '',
    rachaClases: s?.rachaClasesSemana ? String(s.rachaClasesSemana) : '',
  };
}

/**
 * Lo que cambia de verdad respecto a lo guardado, ya normalizado y solo esas
 * columnas (#2027). Vacío = nada que guardar.
 * ⚠️ 0 meses es NULL, no 0: con 0, `caduca_creditos` devolvería hoy y todo el
 * saldo del estudio moriría esta noche.
 */
export function cambiosReglasCreditos(
  form: ReglasCreditosForm,
  guardado: Partial<ColumnasCreditos> | null | undefined,
): Partial<ColumnasCreditos> {
  const cambios: Partial<ColumnasCreditos> = {};
  const nombre = normalizarNombreCreditos(form.nombre);
  if (nombre !== (guardado?.creditosNombre ?? null)) cambios.creditosNombre = nombre;
  const meses = enteroPositivo(form.caducanMeses);
  if (meses !== (guardado?.creditosCaducanMeses ?? null)) cambios.creditosCaducanMeses = meses;
  const racha = enteroPositivo(form.rachaClases);
  if (racha !== (guardado?.rachaClasesSemana ?? null)) cambios.rachaClasesSemana = racha;
  return cambios;
}

// ─── Créditos por acción (filas de `reward_rules`) ──────────────────────────

export type ReglaGuardada = Pick<RewardRule, 'id' | 'trigger' | 'creditos' | 'activa' | 'unidadEuros' | 'topeMensual'>;

export interface AccionForm {
  creditos: string;
  activa: boolean;
  /** Solo COMPRA: cada cuántos euros. */
  unidadEuros: string;
  /** Solo REFERIDO_AMIGO: tope al mes. */
  topeMensual: string;
}

export type AccionesForm = Record<string, AccionForm>;

type ValoresRegla = Pick<RewardRule, 'creditos' | 'activa' | 'unidadEuros' | 'topeMensual'>;

export function accionesAFormulario(reglas: readonly ReglaGuardada[]): AccionesForm {
  return Object.fromEntries(REWARD_TRIGGERS.map(({ trigger }) => {
    const r = reglas.find(x => x.trigger === trigger);
    const accion: AccionForm = {
      creditos: String(r ? r.creditos : CREDITOS_SUGERIDOS[trigger] ?? 0),
      activa: r?.activa ?? false,
      unidadEuros: r?.unidadEuros ? String(r.unidadEuros) : '',
      topeMensual: r?.topeMensual ? String(r.topeMensual) : '',
    };
    return [trigger, accion];
  }));
}

/** Los créditos son un entero, 0 incluido (la regla no da nada). */
export function creditosValidos(texto: string): boolean {
  return /^\d+$/.test(texto.trim());
}

/** Los disparadores cuya cifra de créditos no es un número: no se puede guardar. */
export function accionesConCreditosMal(form: AccionesForm): RewardTrigger[] {
  return REWARD_TRIGGERS.map(d => d.trigger).filter(t => form[t] && !creditosValidos(form[t].creditos));
}

function valores(trigger: RewardTrigger, f: AccionForm): ValoresRegla {
  return {
    creditos: creditosValidos(f.creditos) ? Number.parseInt(f.creditos.trim(), 10) : 0,
    activa: f.activa,
    // Vacío o 0 = cada euro (COMPRA) y sin tope (REFERIDO_AMIGO), como lee el servidor.
    unidadEuros: trigger === 'COMPRA' ? enteroPositivo(f.unidadEuros) : null,
    topeMensual: trigger === 'REFERIDO_AMIGO' ? enteroPositivo(f.topeMensual) : null,
  };
}

export type EscrituraRegla =
  | { trigger: RewardTrigger; id: string; cambios: Partial<ValoresRegla> }
  | { trigger: RewardTrigger; id: null; nueva: ValoresRegla };

/**
 * Qué hay que escribir para que lo guardado sea lo que hay en pantalla: las
 * reglas que existen, solo en lo que cambia; las que no, enteras. Vacío = nada.
 */
export function escriturasDeAcciones(form: AccionesForm, reglas: readonly ReglaGuardada[]): EscrituraRegla[] {
  const base = accionesAFormulario(reglas);
  const escrituras: EscrituraRegla[] = [];
  for (const { trigger } of REWARD_TRIGGERS) {
    if (!form[trigger]) continue;
    const quiere = valores(trigger, form[trigger]);
    const hay = valores(trigger, base[trigger]);
    const cambios: Partial<ValoresRegla> = {};
    for (const k of Object.keys(quiere) as (keyof ValoresRegla)[]) {
      if (quiere[k] !== hay[k]) Object.assign(cambios, { [k]: quiere[k] });
    }
    if (Object.keys(cambios).length === 0) continue;
    const regla = reglas.find(r => r.trigger === trigger);
    escrituras.push(regla ? { trigger, id: regla.id, cambios } : { trigger, id: null, nueva: quiere });
  }
  return escrituras;
}
