// ─────────────────────────────────────────────────────────────────────────────
// Plazas libres del Calendario (pieza F, P3.9): para que recepción conteste
// «¿hay sitio en el Reformer de los martes a partir de noviembre?».
//
// Dos cifras por clase, cada una con su dueño (no se inventa ninguna regla):
//
//  A · Libres ahora = `plazasLibresParaReservar(aforo, ocupadas, apartadas)`:
//      la misma cuenta que la app y el mostrador. Ocupan CONFIRMADA y
//      ASISTIDA (`plazasOcupadas`); la lista de espera y las pendientes de
//      aprobar no, y se enseñan aparte. Salvo que el estudio haya elegido que
//      una plaza OFRECIDA a la lista de espera cuente como ocupada mientras
//      corre su plazo (`studios.lista_espera_reserva_plaza_ofrecida`, la misma
//      regla que `evaluar_reserva`): entonces esa oferta ocupa. Las apartadas para ClassPass se restan
//      (contrato de `lib/plataformas/apartadas-contrato.test.ts`). El aforo es el
//      nominal, el mismo número que la tarjeta de la clase (`hoy-agenda.ts`).
//
//  B · Para una clase fija = Libres − las clases fijas que encajan en la clase
//      (`sesionEncajaEnPlaza`, el mismo emparejamiento que el motor) y aún no
//      tienen su reserva en ella: el motor las reservará (o la alumna vuelve de
//      una pausa que soltó el sitio). Es el «peor caso» de quien quisiera venir
//      todas las semanas. Las que ya están reservadas están dentro de
//      «ocupadas»: nadie cuenta dos veces. No mira si la alumna PUEDE tener
//      clase fija (cuota, nivel): solo si cabe.
//
// La franja de una clase es la clave del motor (`claveFranjaDeSesion`: sala,
// día, hora LOCAL y tipo), así que el cambio de hora no la parte en dos.
//
// Puro: se prueba con `node --test` (también con `TZ=UTC`).
// ─────────────────────────────────────────────────────────────────────────────

import { plazasLibresParaReservar } from '../booking-logic.ts';
import { claveFranjaDeSesion, sesionEncajaEnPlaza } from '../plazas-fijas-slot.ts';
import { sesionEnPausa } from '../plazas-fijas-pausa.ts';
import { franjaLocalDe, hoyEnEstudio, masDias } from '../utils.ts';
import type { PlazaFija } from '../types.ts';

export interface SesionParaHuecos {
  id: string;
  inicio: string;
  fin: string;
  salaId: string;
  tipoClaseId: string;
  aforoMaximo: number;
  cancelada: boolean;
}

export interface ReservaParaHuecos {
  sesionId: string;
  socioId: string | null;
  estado: string;
  /** Plazo de la oferta de una plaza a la lista de espera (ISO); `null` sin oferta. */
  ofertaExpiraEn?: string | null;
}

export interface HuecoSesion {
  id: string;
  inicio: string;
  fin: string;
  salaId: string;
  tipoClaseId: string;
  cancelada: boolean;
  aforo: number;
  ocupadas: number;
  apartadas: number;
  enEspera: number;
  porAprobar: number;
  /** Plazas ofrecidas a la lista de espera con el plazo corriendo (ocupan solo si el estudio lo eligió). */
  ofrecidas: number;
  /** A: lo que se puede reservar ahora desde Tentare. */
  libres: number;
  /** B: el sitio para alguien que viniera todas las semanas (peor caso). */
  paraFija: number;
  /** Clases fijas que encajan y aún no tienen su reserva en esta clase. */
  fijasPorVenir: number;
  /** De ellas, las que vuelven de una pausa que soltó el sitio. */
  vuelvenDePausa: number;
}

const OCUPA = new Set(['CONFIRMADA', 'ASISTIDA']);

/** Una plaza fija cuenta para esta clase si encaja y la alumna aún no tiene fila de reserva en ella. */
function fijaPorVenir(pf: PlazaFija, s: SesionParaHuecos): 'activa' | 'vuelve' | null {
  if (!sesionEncajaEnPlaza(pf, s)) return null;
  if (pf.estado === 'ACTIVA') return sesionEnPausa(pf, s.inicio) ? null : 'activa';
  if (pf.estado === 'PAUSADA') {
    // Soltó el sitio: cuenta desde el día siguiente a su vuelta (o siempre, sin fechas).
    if (!pf.pausaHasta) return 'vuelve';
    return hoyEnEstudio(new Date(s.inicio)) > pf.pausaHasta ? 'vuelve' : null;
  }
  return null;
}

/** Solo las clases que aún no han empezado: «libre ahora» de una clase pasada no dice nada. */
export function huecosDeSesiones(p: {
  sesiones: readonly SesionParaHuecos[];
  reservas: readonly ReservaParaHuecos[];
  plazas: readonly PlazaFija[];
  /** Plazas apartadas por sesión (`plazas_apartadas_de`). */
  apartadas: ReadonlyMap<string, number>;
  ahoraMs: number;
  /** `studios.lista_espera_reserva_plaza_ofrecida`: la plaza ofrecida cuenta como ocupada mientras corre su plazo. */
  ofertaOcupa?: boolean;
}): HuecoSesion[] {
  const porSesion = new Map<string, ReservaParaHuecos[]>();
  for (const r of p.reservas) {
    const l = porSesion.get(r.sesionId);
    if (l) l.push(r); else porSesion.set(r.sesionId, [r]);
  }
  const vivas = p.plazas.filter(pf => pf.estado === 'ACTIVA' || pf.estado === 'PAUSADA');
  return p.sesiones
    .filter(s => Date.parse(s.inicio) > p.ahoraMs)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map(s => {
      const rs = porSesion.get(s.id) ?? [];
      const ofertaViva = (r: ReservaParaHuecos) =>
        !!p.ofertaOcupa && r.estado === 'LISTA_ESPERA' && !!r.ofertaExpiraEn && Date.parse(r.ofertaExpiraEn) > p.ahoraMs;
      const ocupadas = rs.filter(r => OCUPA.has(r.estado) || ofertaViva(r)).length;
      const conFila = new Set(rs.map(r => r.socioId).filter((x): x is string => !!x));
      let fijasPorVenir = 0, vuelvenDePausa = 0;
      // Una clase cancelada no guarda el sitio de nadie.
      for (const pf of s.cancelada ? [] : vivas) {
        if (conFila.has(pf.socioId)) continue;
        const c = fijaPorVenir(pf, s);
        if (!c) continue;
        fijasPorVenir++;
        if (c === 'vuelve') vuelvenDePausa++;
      }
      const aforo = Math.max(0, s.aforoMaximo ?? 0);
      const apartadas = Math.max(0, p.apartadas.get(s.id) ?? 0);
      const libres = s.cancelada ? 0 : plazasLibresParaReservar(aforo, ocupadas, apartadas);
      return {
        id: s.id, inicio: s.inicio, fin: s.fin, salaId: s.salaId, tipoClaseId: s.tipoClaseId,
        cancelada: s.cancelada, aforo, ocupadas, apartadas,
        enEspera: rs.filter(r => r.estado === 'LISTA_ESPERA' && !ofertaViva(r)).length,
        ofrecidas: rs.filter(r => r.estado === 'LISTA_ESPERA' && !!r.ofertaExpiraEn && Date.parse(r.ofertaExpiraEn) > p.ahoraMs).length,
        porAprobar: rs.filter(r => r.estado === 'PENDIENTE_APROBACION').length,
        libres,
        paraFija: Math.max(0, libres - fijasPorVenir),
        fijasPorVenir, vuelvenDePausa,
      };
    });
}

// ── Por franja: «hueco a partir del día X» ─────────────────────────────────

export type EstadoFranja = 'TODAS' | 'DESDE' | 'ALGUNAS' | 'COMPLETA';

export interface FranjaResumen {
  clave: string;
  dow: number;
  /** «18:00», hora de inicio en el estudio. */
  hora: string;
  salaId: string;
  tipoClaseId: string;
  /** Todas las clases de la franja en el rango, en orden (las canceladas, marcadas). */
  clases: { id: string; fecha: string; paraFija: number; cancelada: boolean }[];
  estado: EstadoFranja;
  /** DESDE: la primera fecha a partir de la cual todas tienen sitio. */
  desde: string | null;
  /** La última clase viva del rango: «sitio del 18/11 al 25/11» dice hasta dónde se ha mirado. */
  hasta: string | null;
  /** TODAS y DESDE: el mínimo de sitios desde esa fecha. */
  minSitios: number;
  /** Clases vivas con sitio, y cuántas vivas hay. */
  con: number;
  n: number;
  /** Si la franja deja de tener clases programadas antes del final del rango: hasta cuándo las hay. */
  programadasHasta: string | null;
}

const dosCifras = (n: number) => String(n).padStart(2, '0');

/** Agrupa por franja (la clave del motor) y dice desde cuándo hay sitio para una clase fija. */
export function resumirFranjas(huecos: readonly HuecoSesion[], rango: { hasta: string }): FranjaResumen[] {
  const grupos = new Map<string, HuecoSesion[]>();
  for (const h of huecos) {
    const clave = claveFranjaDeSesion(h);
    const g = grupos.get(clave);
    if (g) g.push(h); else grupos.set(clave, [h]);
  }
  const resumen: FranjaResumen[] = [];
  for (const [clave, lista] of grupos) {
    const orden = [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio));
    const { dow, hora, minuto } = franjaLocalDe(orden[0].inicio);
    const vivas = orden.filter(h => !h.cancelada);
    const con = vivas.filter(h => h.paraFija >= 1).length;
    // X: la primera clase viva desde la que TODAS las siguientes tienen sitio.
    let desdeIdx = vivas.length;
    for (let i = vivas.length - 1; i >= 0 && vivas[i].paraFija >= 1; i--) desdeIdx = i;
    const desdeFecha = desdeIdx < vivas.length ? hoyEnEstudio(new Date(vivas[desdeIdx].inicio)) : null;
    const minSitios = desdeIdx < vivas.length ? Math.min(...vivas.slice(desdeIdx).map(h => h.paraFija)) : 0;
    const estado: EstadoFranja = vivas.length === 0 || con === 0 ? 'COMPLETA'
      : desdeIdx === 0 ? 'TODAS'
        : desdeIdx < vivas.length ? 'DESDE' : 'ALGUNAS';
    const ultima = hoyEnEstudio(new Date(orden[orden.length - 1].inicio));
    resumen.push({
      clave, dow, hora: `${dosCifras(hora)}:${dosCifras(minuto)}`, salaId: orden[0].salaId, tipoClaseId: orden[0].tipoClaseId,
      clases: orden.map(h => ({ id: h.id, fecha: hoyEnEstudio(new Date(h.inicio)), paraFija: h.paraFija, cancelada: h.cancelada })),
      estado, desde: estado === 'DESDE' ? desdeFecha : null,
      hasta: vivas.length > 0 ? hoyEnEstudio(new Date(vivas[vivas.length - 1].inicio)) : null,
      minSitios, con, n: vivas.length,
      programadasHasta: ultima < masDias(rango.hasta, -6) ? ultima : null,
    });
  }
  // Lunes primero, como el calendario; dentro del día, por hora.
  return resumen.sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || a.hora.localeCompare(b.hora) || a.clave.localeCompare(b.clave));
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «18 de noviembre». */
export const fechaEnFrase = (ymd: string) => `${Number(ymd.slice(8, 10))} de ${MESES[Number(ymd.slice(5, 7)) - 1]}`;
/** «18/11». */
export const diaMes = (ymd: string) => `${Number(ymd.slice(8, 10))}/${Number(ymd.slice(5, 7))}`;

/**
 * La frase de una franja en la vista Mes. Siempre sobre la clase FIJA (no sobre
 * una reserva suelta: con 0 para clase fija puede quedar sitio para una), y con
 * sus dos extremos: «sitio desde el 18» a secas se leía como «para siempre».
 */
export function textoFranja(f: FranjaResumen): string {
  switch (f.estado) {
    case 'TODAS':
      if (f.n === 1) return `${f.minSitios} ${f.minSitios === 1 ? 'sitio' : 'sitios'} en su única clase`;
      // Con la franja acabándose antes de fin de mes, «todas» se leía como «todo el mes».
      return f.programadasHasta ? `Sitio en sus ${f.n} clases (hasta el ${diaMes(f.programadasHasta)})` : `Sitio en todas sus clases (mín. ${f.minSitios})`;
    case 'DESDE': return f.desde === f.hasta ? `Sitio solo el ${diaMes(f.desde!)}` : `Sitio del ${diaMes(f.desde!)} al ${diaMes(f.hasta!)}`;
    case 'ALGUNAS': return `Sitio en ${f.con} de sus ${f.n} clases`;
    case 'COMPLETA': return f.n === 0 ? 'Sin clases en estas fechas' : 'Sin sitio para otra clase fija';
  }
}

// ── Fechas del estudio (aritmética de 'YYYY-MM-DD', sin el reloj del navegador) ──

/** La semana (lunes a domingo) que contiene `ymd`. */
export function semanaDe(ymd: string): { desde: string; hasta: string } {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  const desde = masDias(ymd, -((dow + 6) % 7));
  return { desde, hasta: masDias(desde, 6) };
}

/** El mes natural que contiene `ymd`. */
export function mesDe(ymd: string): { desde: string; hasta: string } {
  const desde = `${ymd.slice(0, 7)}-01`;
  const fin = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), 0, 12));
  return { desde, hasta: fin.toISOString().slice(0, 10) };
}

/** Rango máximo que se pide de una vez (un mes) y hasta dónde se puede mirar. */
export const MAX_DIAS_RANGO = 31;
export const MAX_DIAS_ADELANTE = 400;

// Ojo: «2026-13-01» pasa la expresión y da una fecha inválida; `toISOString()` lanzaría.
const esFecha = (f: unknown): f is string => {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
};

/** Valida el rango que pide la pantalla y lo recorta a hoy (lo pasado no tiene plazas libres que ofrecer). */
export function rangoDePlazasLibres(desde: unknown, hasta: unknown, hoy: string):
  { ok: true; desde: string; hasta: string } | { ok: false; error: string } {
  if (!esFecha(desde) || !esFecha(hasta)) return { ok: false, error: 'Fechas no válidas' };
  if (hasta < desde) return { ok: false, error: '«Hasta» es anterior a «Desde»' };
  const dias = Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1;
  if (dias > MAX_DIAS_RANGO) return { ok: false, error: `Como mucho ${MAX_DIAS_RANGO} días de una vez` };
  if (desde > masDias(hoy, MAX_DIAS_ADELANTE)) return { ok: false, error: 'Demasiado lejos' };
  const desdeRecortado = desde < hoy ? hoy : desde;
  if (hasta < desdeRecortado) return { ok: false, error: 'Ese periodo ya ha pasado' };
  return { ok: true, desde: desdeRecortado, hasta };
}
