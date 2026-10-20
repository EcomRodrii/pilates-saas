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
