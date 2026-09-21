import type { ConfigCompleta } from './servidor.ts';

/**
 * Lo que la propietaria puede ajustar de la previsión, en las unidades en que
 * lo piensa (porcentajes y semanas), no en las de la BD (fracciones y días).
 */
export interface AjustesApertura {
  objetivoPreventaPct: number;
  conversionLeadsPct: number;
  umbralAmarilloPct: number;
  umbralRojoPct: number;
  ventanaSemanas: number;
  sesionesSemanaSinTope: number;
  semanasBonoSinCaducidad: number;
}

export function ajustesDesdeConfig(c: ConfigCompleta): AjustesApertura {
  return {
    objetivoPreventaPct: Math.round(c.objetivoPreventa * 100),
    conversionLeadsPct: Math.round(c.conversionLeads * 100),
    umbralAmarilloPct: Math.round(c.umbralAmarillo * 100),
    umbralRojoPct: Math.round(c.umbralRojo * 100),
    ventanaSemanas: Math.round(c.ventanaAnalisisDias / 7),
    sesionesSemanaSinTope: c.sesionesSemanaSinTope,
    semanasBonoSinCaducidad: c.semanasBonoSinCaducidad,
  };
}

/** Fila de opening_config. Los límites son los mismos CHECK de la migración base. */
export interface FilaConfig {
  objetivo_preventa: number;
  conversion_leads: number;
  umbral_amarillo: number;
  umbral_rojo: number;
  ventana_analisis_dias: number;
  sesiones_semana_sin_tope: number;
  semanas_bono_sin_caducidad: number;
}

const entero = (v: unknown) => (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isInteger(Number(v)) ? Number(v) : NaN;
const numero = (v: unknown) => (typeof v === 'number' || typeof v === 'string') && v !== '' ? Number(v) : NaN;

export function validarAjustes(b: unknown): { ok: true; fila: FilaConfig } | { ok: false; error: string } {
  const x = (b ?? {}) as Record<string, unknown>;
  const objetivo = entero(x.objetivoPreventaPct);
  const conversion = entero(x.conversionLeadsPct);
  const amarillo = entero(x.umbralAmarilloPct);
  const rojo = entero(x.umbralRojoPct);
  const semanas = entero(x.ventanaSemanas);
  const sinTope = numero(x.sesionesSemanaSinTope);
  const bono = entero(x.semanasBonoSinCaducidad);

  if (!(objetivo >= 1 && objetivo <= 100)) return { ok: false, error: 'El objetivo de preventa va de 1 % a 100 %' };
  if (!(conversion >= 0 && conversion <= 100)) return { ok: false, error: 'El porcentaje de interesadas que se apuntan va de 0 % a 100 %' };
  if (!(amarillo >= 1 && amarillo <= 99)) return { ok: false, error: 'El aviso «se va llenando» va de 1 % a 99 %' };
  if (!(rojo >= 1 && rojo <= 150)) return { ok: false, error: 'El aviso «te quedas sin plazas» va de 1 % a 150 %' };
  if (amarillo >= rojo) return { ok: false, error: '«Se va llenando» tiene que ser menor que «te quedas sin plazas»' };
  if (!(semanas >= 1 && semanas <= 17)) return { ok: false, error: 'La previsión abarca de 1 a 17 semanas' };
  if (!(sinTope >= 0.5 && sinTope <= 7)) return { ok: false, error: 'Las clases por semana de una cuota sin tope van de 0,5 a 7' };
  if (Math.round(sinTope * 10) !== sinTope * 10) return { ok: false, error: 'Las clases por semana admiten un decimal como mucho' };
  if (!(bono >= 1 && bono <= 52)) return { ok: false, error: 'Las semanas de un bono sin caducidad van de 1 a 52' };

  return {
    ok: true,
    fila: {
      objetivo_preventa: objetivo / 100,
      conversion_leads: conversion / 100,
      umbral_amarillo: amarillo / 100,
      umbral_rojo: rojo / 100,
      ventana_analisis_dias: semanas * 7,
      sesiones_semana_sin_tope: sinTope,
      semanas_bono_sin_caducidad: bono,
    },
  };
}
