// Evaluador puro de segmentos de clientes — mismo criterio que
// lib/decision/senales.ts: índices Map precomputados una vez, nunca
// recorrer las colecciones completas por socia dentro del filtro.
//
// Deliberadamente fuera de lib/decision: esta v1 es solo el filtro de
// Clientes (auditoría §4, decisión de alcance). Reutiliza
// ultimaAsistidaPorSocio de lib/engines/senales-inactividad.ts (la misma
// función que ya usan automation-engine.ts y marketing-automation-engine.ts,
// para no calcular "última visita" una tercera vez con un criterio que
// pueda divergir), pero no importa nada de lib/decision — si en el futuro
// un segmento guardado alimenta El Umbral, es una fase 2 explícita.
import type { Socio, Suscripcion, Reserva, Sesion, CampoPersonalizado } from '@/lib/types';
import { ultimaAsistidaPorSocio } from '../engines/senales-inactividad.ts';
import type { CampoSegmento, Comparador, CondicionSegmento, DefinicionSegmento } from './tipos.ts';

export interface ContextoSegmento {
  now: Date;
  ultimaAsistidaPorSocio: Map<string, string>;
  suscripcionActivaPorSocio: Map<string, Suscripcion>;
  tieneReservaFuturaPorSocio: Set<string>;
  camposPersonalizados: CampoPersonalizado[];
}

const MS_DIA = 86400000;

export function construirContextoSegmento(
  socios: Socio[],
  suscripciones: Suscripcion[],
  reservas: Reserva[],
  sesiones: Sesion[],
  camposPersonalizados: CampoPersonalizado[],
  now: Date,
): ContextoSegmento {
  const suscripcionActivaPorSocio = new Map<string, Suscripcion>();
  for (const sus of suscripciones) {
    if (sus.estado === 'ACTIVA' && !suscripcionActivaPorSocio.has(sus.socioId)) {
      suscripcionActivaPorSocio.set(sus.socioId, sus);
    }
  }

  const sesionPorId = new Map(sesiones.map(se => [se.id, se]));
  const tieneReservaFuturaPorSocio = new Set<string>();
  for (const r of reservas) {
    if (r.estado === 'CANCELADA') continue;
    const sesion = sesionPorId.get(r.sesionId);
    if (sesion && !sesion.cancelada && new Date(sesion.inicio).getTime() > now.getTime()) {
      tieneReservaFuturaPorSocio.add(r.socioId);
    }
  }

  return {
    now,
    ultimaAsistidaPorSocio: ultimaAsistidaPorSocio(reservas),
    suscripcionActivaPorSocio,
    tieneReservaFuturaPorSocio,
    camposPersonalizados,
  };
}

function diasEntre(desdeISO: string, hasta: Date): number {
  return Math.floor((hasta.getTime() - new Date(desdeISO).getTime()) / MS_DIA);
}

// Próximo cumpleaños en días (ignora el año de nacimiento) — null si no hay
// fecha de nacimiento registrada.
function diasHastaProximoCumpleanos(fechaNacimientoISO: string, now: Date): number {
  const nac = new Date(fechaNacimientoISO);
  const esteAnio = new Date(now.getFullYear(), nac.getMonth(), nac.getDate());
  const objetivo = esteAnio.getTime() >= now.getTime() ? esteAnio : new Date(now.getFullYear() + 1, nac.getMonth(), nac.getDate());
  return Math.ceil((objetivo.getTime() - now.getTime()) / MS_DIA);
}

function compararNumero(actual: number | null, comparador: Comparador, valor: number): boolean {
  if (actual === null) return false; // sin dato conocido: nunca cumple una condición numérica
  if (comparador === 'mayor_que') return actual > valor;
  if (comparador === 'menor_que') return actual < valor;
  if (comparador === 'igual') return actual === valor;
  if (comparador === 'distinto') return actual !== valor;
  return false;
}

function compararBooleano(actual: boolean, comparador: Comparador): boolean {
  if (comparador === 'es_verdadero') return actual;
  if (comparador === 'es_falso') return !actual;
  return false;
}

function compararTexto(actual: string | null, comparador: Comparador, valor: string): boolean {
  if (actual === null) return comparador === 'distinto';
  if (comparador === 'igual') return actual === valor;
  if (comparador === 'distinto') return actual !== valor;
  return false;
}

function valorCampoExtra(socio: Socio, campoId: string, tipo: CampoPersonalizado['tipo']): unknown {
  const bruto = socio.camposExtra?.[campoId];
  if (bruto === undefined || bruto === null) return null;
  if (tipo === 'numero') return typeof bruto === 'number' ? bruto : Number(bruto);
  if (tipo === 'booleano') return Boolean(bruto);
  return String(bruto);
}

export function evaluarCondicion(cond: CondicionSegmento, socio: Socio, ctx: ContextoSegmento): boolean {
  const campo: CampoSegmento = cond.campo;

  if (campo === 'dias_desde_ultima_visita') {
    const ultima = ctx.ultimaAsistidaPorSocio.get(socio.id) ?? null;
    return compararNumero(ultima ? diasEntre(ultima, ctx.now) : null, cond.comparador, Number(cond.valor));
  }
  if (campo === 'tiene_reserva_futura') {
    return compararBooleano(ctx.tieneReservaFuturaPorSocio.has(socio.id), cond.comparador);
  }
  if (campo === 'dias_desde_alta') {
    return compararNumero(diasEntre(socio.fechaAlta, ctx.now), cond.comparador, Number(cond.valor));
  }
  if (campo === 'cumpleanos_en_proximos_dias') {
    const dias = socio.fechaNacimiento ? diasHastaProximoCumpleanos(socio.fechaNacimiento, ctx.now) : null;
    return compararNumero(dias, cond.comparador, Number(cond.valor));
  }
  if (campo === 'etiqueta') {
    const tieneEtiqueta = (socio.tags ?? []).includes(String(cond.valor));
    return cond.comparador === 'distinto' ? !tieneEtiqueta : tieneEtiqueta;
  }
  if (campo === 'bono_caduca_en_dias') {
    const sus = ctx.suscripcionActivaPorSocio.get(socio.id);
    const dias = sus?.fechaFin ? diasEntre(sus.fechaFin, ctx.now) * -1 : null; // fechaFin futura → días restantes positivos
    return compararNumero(dias, cond.comparador, Number(cond.valor));
  }
  if (campo === 'sin_bono_activo') {
    return compararBooleano(!ctx.suscripcionActivaPorSocio.has(socio.id), cond.comparador);
  }
  if (campo === 'lead_stage') {
    return compararTexto(socio.leadStage ?? null, cond.comparador, String(cond.valor));
  }
  if (campo.startsWith('campo_extra:')) {
    const campoId = campo.slice('campo_extra:'.length);
    const def = ctx.camposPersonalizados.find(c => c.id === campoId);
    if (!def) return false; // campo borrado desde que se guardó el segmento
    const actual = valorCampoExtra(socio, campoId, def.tipo);
    if (def.tipo === 'numero') return compararNumero(actual as number | null, cond.comparador, Number(cond.valor));
    if (def.tipo === 'booleano') return compararBooleano(Boolean(actual), cond.comparador);
    return compararTexto(actual as string | null, cond.comparador, String(cond.valor));
  }
  return false;
}

export function evaluarSegmento(def: DefinicionSegmento, socio: Socio, ctx: ContextoSegmento): boolean {
  if (def.condiciones.length === 0) return true; // segmento vacío = todo el mundo, coherente con "sin filtro"
  if (def.operador === 'AND') return def.condiciones.every(c => evaluarCondicion(c, socio, ctx));
  return def.condiciones.some(c => evaluarCondicion(c, socio, ctx));
}
