import type { Reserva, Sesion } from '@/lib/types';
// Import RELATIVO con extensión explícita, no `@/` — este fichero se prueba
// con `node --test --experimental-strip-types`, que no resuelve el alias en
// un import de VALOR (el de arriba es `import type`, se borra al compilar y
// por eso nunca dio problema). Ver alias-arroba-oculta-tests-node-test.md.
import { claveSemanaEstudio, hoyEnEstudio, inicioDelDiaEstudio, masDias } from '../utils.ts';

export interface RachaInfo {
  semanas: number;
  // true si ya tiene una racha (>=1 semana anterior) pero todavía no ha
  // entrenado esta semana — se le acaba el tiempo para mantenerla.
  enRiesgo: boolean;
  diasParaPerder: number | null;
  // Clave estable de la semana actual (lunes en formato ISO) — útil como
  // ref_id para no otorgar dos veces los créditos de "semana completa".
  claveSemanaActual: string;
  /**
   * `semanas` es su mejor marca histórica.
   *
   * Lo pide el Inicio del tema Tentada, que escribe «— tu mejor racha» y NO
   * puede escribirlo siempre: es una afirmación comprobable. Vive aquí y no en
   * un cálculo aparte porque la racha ya tenía dueño — este motor, que es
   * además el que alimenta los logros. Dos fuentes de la misma cifra dejarían
   * el Inicio diciendo 6 semanas y su insignia diciendo 5.
   */
  esMejor: boolean;
}

// La semana (lunes a domingo) y el mes son los del ESTUDIO, nunca los del
// runtime: el servidor corre en UTC y una clase del lunes a las 00:30 de Madrid
// caía en la semana anterior (y la del día 1, en el mes anterior). Todas las
// claves son 'YYYY-MM-DD' del lunes, y el salto de semana es `masDias(…, 7)`.

export function calcularRacha(reservas: Reserva[], sesiones: Sesion[], now: Date): RachaInfo {
  // P0-22: Map por id en vez de .find() lineal por cada reserva (O(reservas)).
  const sesionById = new Map(sesiones.map(s => [s.id, s]));
  const asistidas = reservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesionById.get(r.sesionId))
    .filter((s): s is Sesion => !!s)
    .map(s => new Date(s.inicio));

  const claveActual = claveSemanaEstudio(now);

  if (asistidas.length === 0) {
    return { semanas: 0, enRiesgo: false, diasParaPerder: null, claveSemanaActual: claveActual, esMejor: false };
  }

  const semanasConClase = new Set(asistidas.map(d => claveSemanaEstudio(d)));
  const estaSemanaTieneClase = semanasConClase.has(claveActual);

  let racha = 0;
  let cursor = estaSemanaTieneClase ? claveActual : masDias(claveActual, -7);
  while (semanasConClase.has(cursor)) {
    racha++;
    cursor = masDias(cursor, -7);
  }

  // En riesgo: hay racha de semanas anteriores pero esta semana aún no ha
  // entrenado. El domingo a las 23:59 se acaba el plazo.
  const enRiesgo = racha > 0 && !estaSemanaTieneClase;
  let diasParaPerder: number | null = null;
  if (enRiesgo) {
    // Fin de la semana: el domingo a las 23:59:59.999 de Madrid = un
    // milisegundo antes de que empiece el lunes siguiente.
    const finDeSemana = new Date(inicioDelDiaEstudio(masDias(claveActual, 7))).getTime() - 1;
    diasParaPerder = Math.max(0, Math.ceil((finDeSemana - now.getTime()) / 86400000));
  }

  // ¿Es su mejor marca? Se recorre el historial ordenado contando tramos
  // seguidos. Las claves son 'YYYY-MM-DD', así que ordenan bien como texto.
  const todas = [...semanasConClase].sort();
  const previaDe = (clave: string) => masDias(clave, -7);
  let mejor = 0, tramo = 0, previa: string | null = null;
  for (const semana of todas) {
    tramo = previa !== null && previaDe(semana) === previa ? tramo + 1 : 1;
    if (tramo > mejor) mejor = tramo;
    previa = semana;
  }

  return {
    // `estaSemanaTieneClase ? racha : racha` — las dos ramas eran idénticas.
    semanas: racha,
    enRiesgo,
    diasParaPerder,
    // Lo que panel y kiosko usan como `ref_id` de "semana completa": ambos
    // tienen que dar la misma clave para la misma semana real (I-4, auditoría
    // 2026-09-10), y es la misma con la que se agrupan las clases arriba.
    claveSemanaActual: claveActual,
    esMejor: racha > 0 && racha >= mejor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RACHA ÚNICA (PR 3.3, detrás de `RACHA_UNICA`)
//
// La función única de racha y semana: motor, portal y panel llaman a ESTA, no a
// una copia. Definiciones aprobadas por el fundador (D1–D13 de la Fase 3):
//
//  - Asistencia válida = solo `ASISTIDA` en una clase que el estudio no canceló.
//    Una `CONFIRMADA` de clase terminada está «por confirmar»: ni suma ni resta.
//  - Falta = no-show SOLO si en esa clase se pasó lista, o cancelación tardía.
//    Cancelar a tiempo o que cancele el estudio no es falta. (La falta por sí
//    sola no rompe nada: lo que importa es si la semana llegó a la meta.)
//  - Semana = lunes–domingo en hora del estudio, por FECHA (`claveSemanaEstudio`
//    / `masDias`), nunca 7×24 h: el cambio de hora y el fin de año no la rompen.
//  - Semana completa = al menos 1 asistencia válida (meta fija, D3 = O1).
//  - Semana NEUTRA (no suma ni resta; solo si no llegó a la meta): cierre del
//    estudio que toque cualquier día, clase suya cancelada por el estudio, cuota
//    congelada o plaza fija en pausa, estudio sin clases, clase sin lista.
//  - Racha = semanas completas seguidas SALTANDO las neutras; la semana en curso
//    nunca rompe.
//  - Respiro: cada 4 semanas completas seguidas se gana uno (máximo 1). Si falla
//    una semana normal, se gasta y la racha sigue (esa semana no suma). Sin
//    respiro, vuelve a 0. Se calcula del historial: sin compra ni ledger.
//
// ⚠️ No se construye «racha en riesgo» ni «avisar vacaciones» (D6): `enRiesgo`
// es siempre false y `diasParaPerder` null.
// ⚠️ La «semana de alta» (causa f del documento) no tiene efecto con meta 1: la
// semana de la primera asistencia ya es completa. Si algún día hay meta > 1,
// entra aquí.
// ─────────────────────────────────────────────────────────────────────────────

/** Semanas completas seguidas que dan un respiro. */
export const SEMANAS_POR_RESPIRO = 4;
/** Meta de «semana completa»: fija (D3 = O1). El dinero nunca va por una meta personal (D12). */
export const META_SEMANA_COMPLETA = 1;

/** Una reserva de la alumna con lo que hace falta de su clase. Puro: sin `@/`. */
export interface HechoClase {
  /** Instante de inicio de la clase (ISO). */
  inicio: string;
  estado: Reserva['estado'];
  /** `sesiones.cancelada`: la canceló el estudio. Se mira PRIMERO. */
  sesionCancelada: boolean;
  /** `reservas.cancelada_tardia`. */
  canceladaTardia?: boolean | null;
  /** En esa clase alguien figura `ASISTIDA`: se pasó lista. */
  sesionConLista: boolean;
}

/** Rango de fechas del estudio ('YYYY-MM-DD'), ambos extremos incluidos. `hasta` null = abierto. */
export interface RangoFechas { desde: string; hasta: string | null }

export interface EntradaRacha {
  clases: HechoClase[];
  /** Cierres del estudio (`cierres_estudio`). */
  cierres: RangoFechas[];
  /** Cuota congelada (`congelaciones`) y plaza fija en pausa (`plazas_fijas.pausa_*`). */
  pausas: RangoFechas[];
  /** Lunes de las semanas en que el estudio no ofreció NINGUNA clase (el cargador las busca solo donde hace falta). */
  semanasSinClases: ReadonlySet<string>;
  now: Date;
}

export type CausaNeutra = 'cierre' | 'clase_cancelada' | 'pausa' | 'sin_clases' | 'sin_lista';
export type EstadoSemana = 'completa' | 'neutra' | 'fallida';

export interface SemanaRacha {
  /** Lunes, 'YYYY-MM-DD'. */
  clave: string;
  estado: EstadoSemana;
  validas: number;
  faltas: number;
  causa: CausaNeutra | null;
  /** Una semana fallida que cubrió el respiro (la racha siguió, sin sumar). */
  cubiertaPorRespiro: boolean;
  /** Es la semana en curso: nunca rompe. */
  enCurso: boolean;
}

export interface RachaUnica extends RachaInfo {
  /** Mejor racha alcanzada (derivada del mismo historial, no se guarda). */
  mejor: number;
  respiroDisponible: boolean;
  /** Semanas completas seguidas hacia el próximo respiro (0–3). */
  haciaRespiro: number;
  semanaEnCurso: {
    clave: string;
    hechas: number;
    meta: number;
    /** `reservada` incluye la clase ya hecha pero «por confirmar». */
    estado: 'hecha' | 'reservada' | 'pendiente';
  };
  detalle: SemanaRacha[];
}

interface SemanaAnalizada {
  validas: number;
  faltas: number;
  claseCancelada: boolean;
  sinLista: boolean;
  reservadaFutura: boolean;
  porConfirmar: boolean;
}

const CERO: SemanaAnalizada = { validas: 0, faltas: 0, claseCancelada: false, sinLista: false, reservadaFutura: false, porConfirmar: false };

function analizarClases(clases: HechoClase[], now: Date): Map<string, SemanaAnalizada> {
  const porSemana = new Map<string, SemanaAnalizada>();
  for (const c of clases) {
    const clave = claveSemanaEstudio(new Date(c.inicio));
    const w = porSemana.get(clave) ?? { ...CERO };
    porSemana.set(clave, w);
    // Una reserva que nunca fue suya (espera, pendiente de aprobar) no cuenta para nada.
    if (c.estado === 'LISTA_ESPERA' || c.estado === 'PENDIENTE_APROBACION') continue;
    // La clase cancelada por el estudio manda sobre cualquier estado de la reserva.
    if (c.sesionCancelada) { w.claseCancelada = true; continue; }
    const pasada = new Date(c.inicio).getTime() <= now.getTime();
    switch (c.estado) {
      case 'ASISTIDA': w.validas++; break;
      case 'CONFIRMADA':
        if (pasada) { w.porConfirmar = true; } else { w.reservadaFutura = true; }
        break;
      case 'NO_ASISTIO':
        if (c.sesionConLista) w.faltas++; else w.sinLista = true;
        break;
      case 'CANCELADA':
        if (c.canceladaTardia) w.faltas++;
        break;
    }
  }
  return porSemana;
}

function tocaLaSemana(rangos: RangoFechas[], lunes: string): boolean {
  const domingo = masDias(lunes, 6);
  return rangos.some(r => r.desde <= domingo && (r.hasta === null || r.hasta >= lunes));
}

/** Causa neutra de una semana que NO llegó a la meta, salvo `sin_clases` (que decide quien sabe lo que ofreció el estudio). */
function causaNeutra(w: SemanaAnalizada, lunes: string, e: EntradaRacha): CausaNeutra | null {
  if (tocaLaSemana(e.cierres, lunes)) return 'cierre';
  if (w.claseCancelada) return 'clase_cancelada';
  if (tocaLaSemana(e.pausas, lunes)) return 'pausa';
  // «Por confirmar» en una semana ya cerrada: el barrido la resolverá; mientras tanto no se la castiga.
  if (w.sinLista || w.porConfirmar) return 'sin_lista';
  return null;
}

function primeraSemanaValida(porSemana: Map<string, SemanaAnalizada>): string | null {
  let primera: string | null = null;
  for (const [clave, w] of porSemana) if (w.validas > 0 && (primera === null || clave < primera)) primera = clave;
  return primera;
}

/**
 * Semanas CERRADAS en las que la alumna no llegó a la meta y ninguna causa
 * conocida las vuelve neutras: son las únicas en las que hace falta preguntar
 * si el estudio ofreció clases. El cargador solo consulta esas, no todo el año.
 */
export function semanasCandidatasSinClases(e: Omit<EntradaRacha, 'semanasSinClases'>): string[] {
  const porSemana = analizarClases(e.clases, e.now);
  const primera = primeraSemanaValida(porSemana);
  if (!primera) return [];
  const actual = claveSemanaEstudio(e.now);
  const out: string[] = [];
  for (let s = primera; s < actual; s = masDias(s, 7)) {
    const w = porSemana.get(s) ?? CERO;
    if (w.validas >= META_SEMANA_COMPLETA) continue;
    if (causaNeutra(w, s, { ...e, semanasSinClases: new Set() }) === null) out.push(s);
  }
  return out;
}

export function calcularRachaUnica(e: EntradaRacha): RachaUnica {
  const actual = claveSemanaEstudio(e.now);
  const porSemana = analizarClases(e.clases, e.now);
  const primera = primeraSemanaValida(porSemana);

  const enCursoW = porSemana.get(actual) ?? CERO;
  const hechas = enCursoW.validas;
  const semanaEnCurso: RachaUnica['semanaEnCurso'] = {
    clave: actual,
    // Sin pasar de la meta: dos reservas de la misma clase no son «2 de 1».
    hechas: Math.min(hechas, META_SEMANA_COMPLETA),
    meta: META_SEMANA_COMPLETA,
    estado: hechas >= META_SEMANA_COMPLETA ? 'hecha' : (enCursoW.reservadaFutura || enCursoW.porConfirmar ? 'reservada' : 'pendiente'),
  };

  const vacio: RachaUnica = {
    semanas: 0, enRiesgo: false, diasParaPerder: null, claveSemanaActual: actual, esMejor: false,
    mejor: 0, respiroDisponible: false, haciaRespiro: 0, semanaEnCurso, detalle: [],
  };
  if (!primera) return vacio;

  let racha = 0, mejor = 0, haciaRespiro = 0, respiro = false;
  const detalle: SemanaRacha[] = [];
  const sumaCompleta = () => {
    racha++;
    if (racha > mejor) mejor = racha;
    haciaRespiro++;
    if (haciaRespiro >= SEMANAS_POR_RESPIRO) { respiro = true; haciaRespiro = 0; }
  };

  for (let s = primera; s <= actual; s = masDias(s, 7)) {
    const w = porSemana.get(s) ?? CERO;
    const enCurso = s === actual;
    const base = { clave: s, validas: w.validas, faltas: w.faltas, enCurso, cubiertaPorRespiro: false };
    if (w.validas >= META_SEMANA_COMPLETA) {
      sumaCompleta();
      detalle.push({ ...base, estado: 'completa', causa: null });
      continue;
    }
    // La semana en curso nunca rompe ni suma hasta que llega a la meta.
    if (enCurso) { detalle.push({ ...base, estado: 'neutra', causa: null }); continue; }
    const causa = causaNeutra(w, s, e) ?? (e.semanasSinClases.has(s) ? 'sin_clases' : null);
    if (causa) { detalle.push({ ...base, estado: 'neutra', causa }); continue; }
    if (respiro) {
      respiro = false; haciaRespiro = 0;
      detalle.push({ ...base, estado: 'fallida', causa: null, cubiertaPorRespiro: true });
    } else {
      racha = 0; haciaRespiro = 0;
      detalle.push({ ...base, estado: 'fallida', causa: null });
    }
  }

  return {
    semanas: racha,
    enRiesgo: false,
    diasParaPerder: null,
    claveSemanaActual: actual,
    esMejor: racha > 0 && racha >= mejor,
    mejor,
    respiroDisponible: respiro,
    haciaRespiro,
    semanaEnCurso,
    detalle,
  };
}

/**
 * Clave del mes en curso, formato YYYY-MM -- usada como sufijo del ref_id
 * de OBJETIVO_MENSUAL (socioId:YYYY-MM), mismo principio que
 * claveSemanaActual arriba: la RPC vuelve a derivarla y comparar, asi que
 * el formato tiene que coincidir byte a byte con to_char(hoy_estudio(),
 * YYYY-MM) en SQL: los dos miran el día del estudio (Madrid).
 */
export function claveMesActual(now: Date): string {
  return hoyEnEstudio(now).slice(0, 7);
}

/**
 * La socia ya alcanzo su objetivoClasesMes dentro del mes de calendario en
 * curso? Mismo criterio de "hecha" que cuentaComoHecha (lib/student/ritmo.ts)
 * y que la rama OBJETIVO_MENSUAL de otorgar_credito_disparador: ASISTIDA, o
 * CONFIRMADA con la sesion ya pasada. null/undefined/menor que 1 = sin
 * objetivo fijado, nunca "alcanzado".
 */
export function objetivoMensualAlcanzado(
  reservas: Reserva[], sesiones: Sesion[], objetivoClasesMes: number | null | undefined, now: Date,
): boolean {
  if (!objetivoClasesMes || objetivoClasesMes < 1) return false;
  const sesionById = new Map(sesiones.map(s => [s.id, s]));
  const mesActual = claveMesActual(now);
  let hechas = 0;
  for (const r of reservas) {
    const s = sesionById.get(r.sesionId);
    if (!s) continue;
    const inicio = new Date(s.inicio);
    if (claveMesActual(inicio) !== mesActual) continue;
    const hecha = r.estado === 'ASISTIDA' || (r.estado === 'CONFIRMADA' && inicio < now);
    if (hecha) hechas++;
  }
  return hechas >= objetivoClasesMes;
}
