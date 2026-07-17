// Analítica derivada del módulo de Contenido. Determinista: las mismas
// publicaciones + el mismo rango producen siempre los mismos números.

import type { Publicacion, Plataforma } from './types';
import { PLATAFORMAS, PLATAFORMA_META } from './types';

export type RangoDias = 7 | 30 | 90;

export interface DeltaMetrica {
  valor: number;
  anterior: number;
  cambioPct: number;   // % respecto al periodo anterior (puede ser negativo)
}

export interface ResumenMetricas {
  seguidores: DeltaMetrica;
  alcance: DeltaMetrica;
  interacciones: DeltaMetrica;
  visualizaciones: DeltaMetrica;
  engagement: DeltaMetrica;   // %
  mejorPublicacion: Publicacion | null;
}

export interface PuntoSerie {
  fecha: string;      // ISO (día)
  seguidores: number;
  alcance: number;
  interacciones: number;
}

export interface ComparativaRed {
  plataforma: Plataforma;
  label: string;
  color: string;
  seguidores: number;
  alcance: number;
  interacciones: number;
  engagement: number;   // %
  publicaciones: number;
}

const DIA_MS = 86_400_000;

// Base de seguidores por plataforma (determinista).
const SEGUIDORES_BASE: Record<Plataforma, number> = {
  instagram: 12480,
  tiktok: 8640,
  youtube: 3120,
  facebook: 5460,
  linkedin: 1980,
  twitter: 2760,
};

// Crecimiento diario medio por plataforma (nuevos seguidores/día).
const CRECIMIENTO_DIA: Record<Plataforma, number> = {
  instagram: 34, tiktok: 61, youtube: 9, facebook: 6, linkedin: 7, twitter: 11,
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Seguidores totales acumulados hasta `fecha` (suma de todas las plataformas
// o una en concreto), creciendo linealmente desde una fecha ancla.
function seguidoresEn(fecha: Date, ancla: Date, plat?: Plataforma): number {
  const dias = Math.round((startOfDay(fecha).getTime() - startOfDay(ancla).getTime()) / DIA_MS);
  const plats = plat ? [plat] : PLATAFORMAS;
  return plats.reduce((acc, p) => {
    // Pequeña ondulación determinista para que la curva no sea recta perfecta.
    const wobble = Math.round(Math.sin(dias / 4 + PLATAFORMAS.indexOf(p)) * CRECIMIENTO_DIA[p] * 1.5);
    return acc + SEGUIDORES_BASE[p] + CRECIMIENTO_DIA[p] * dias + wobble;
  }, 0);
}

function pubsEnRango(pubs: Publicacion[], desde: Date, hasta: Date): Publicacion[] {
  return pubs.filter((p) => {
    if (p.estado !== 'publicada' || !p.metricas) return false;
    const t = new Date(p.fechaPublicada ?? p.fechaProgramada).getTime();
    return t >= desde.getTime() && t < hasta.getTime();
  });
}

function suma(pubs: Publicacion[], campo: 'alcance' | 'interacciones' | 'visualizaciones'): number {
  return pubs.reduce((acc, p) => acc + (p.metricas ? p.metricas[campo] : 0), 0);
}

function delta(valor: number, anterior: number): DeltaMetrica {
  const cambioPct = anterior === 0 ? (valor > 0 ? 100 : 0) : ((valor - anterior) / anterior) * 100;
  return { valor, anterior, cambioPct };
}

export function calcularResumen(pubs: Publicacion[], rango: RangoDias, now: Date): ResumenMetricas {
  const ancla = new Date(now.getTime() - 120 * DIA_MS); // ancla fija de la curva de seguidores
  const finActual = now;
  const iniActual = new Date(now.getTime() - rango * DIA_MS);
  const iniAnterior = new Date(now.getTime() - 2 * rango * DIA_MS);

  const actuales = pubsEnRango(pubs, iniActual, finActual);
  const anteriores = pubsEnRango(pubs, iniAnterior, iniActual);

  const alcanceAct = suma(actuales, 'alcance');
  const alcanceAnt = suma(anteriores, 'alcance');
  const interAct = suma(actuales, 'interacciones');
  const interAnt = suma(anteriores, 'interacciones');
  const visAct = suma(actuales, 'visualizaciones');
  const visAnt = suma(anteriores, 'visualizaciones');

  const segAct = seguidoresEn(finActual, ancla);
  const segAnt = seguidoresEn(iniActual, ancla);

  const engAct = alcanceAct === 0 ? 0 : (interAct / alcanceAct) * 100;
  const engAnt = alcanceAnt === 0 ? 0 : (interAnt / alcanceAnt) * 100;

  const mejorPublicacion = actuales.length
    ? actuales.reduce((best, p) =>
        (p.metricas!.interacciones > (best?.metricas?.interacciones ?? 0) ? p : best), actuales[0])
    : null;

  return {
    seguidores: delta(segAct, segAnt),
    alcance: delta(alcanceAct, alcanceAnt),
    interacciones: delta(interAct, interAnt),
    visualizaciones: delta(visAct, visAnt),
    engagement: delta(Number(engAct.toFixed(2)), Number(engAnt.toFixed(2))),
    mejorPublicacion,
  };
}

// Serie diaria para el gráfico de evolución (últimos `rango` días).
export function serieEvolucion(pubs: Publicacion[], rango: RangoDias, now: Date): PuntoSerie[] {
  const ancla = new Date(now.getTime() - 120 * DIA_MS);
  const puntos: PuntoSerie[] = [];
  for (let i = rango - 1; i >= 0; i--) {
    const dia = startOfDay(new Date(now.getTime() - i * DIA_MS));
    const finDia = new Date(dia.getTime() + DIA_MS);
    const delDia = pubsEnRango(pubs, dia, finDia);
    puntos.push({
      fecha: dia.toISOString(),
      seguidores: seguidoresEn(dia, ancla),
      alcance: suma(delDia, 'alcance'),
      interacciones: suma(delDia, 'interacciones'),
    });
  }
  return puntos;
}

export function comparativaRedes(pubs: Publicacion[], rango: RangoDias, now: Date): ComparativaRed[] {
  const iniActual = new Date(now.getTime() - rango * DIA_MS);
  const actuales = pubsEnRango(pubs, iniActual, now);
  return PLATAFORMAS.map((plat) => {
    const dePlat = actuales.filter((p) => p.plataformas.includes(plat));
    const alcance = suma(dePlat, 'alcance');
    const interacciones = suma(dePlat, 'interacciones');
    return {
      plataforma: plat,
      label: PLATAFORMA_META[plat].label,
      color: PLATAFORMA_META[plat].color,
      seguidores: seguidoresEn(now, new Date(now.getTime() - 120 * DIA_MS), plat),
      alcance,
      interacciones,
      engagement: alcance === 0 ? 0 : Number(((interacciones / alcance) * 100).toFixed(2)),
      publicaciones: dePlat.length,
    };
  }).sort((a, b) => b.seguidores - a.seguidores);
}
