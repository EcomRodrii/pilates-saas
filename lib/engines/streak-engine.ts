import type { Reserva, Sesion } from '@/lib/types';

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

function lunesDe(d: Date): Date {
  const copia = new Date(d);
  const diaSemana = (copia.getDay() + 6) % 7; // 0 = lunes
  copia.setDate(copia.getDate() - diaSemana);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function claveSemana(lunes: Date): string {
  return lunes.toISOString().slice(0, 10);
}

export function calcularRacha(reservas: Reserva[], sesiones: Sesion[], now: Date): RachaInfo {
  // P0-22: Map por id en vez de .find() lineal por cada reserva (O(reservas)).
  const sesionById = new Map(sesiones.map(s => [s.id, s]));
  const asistidas = reservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesionById.get(r.sesionId))
    .filter((s): s is Sesion => !!s)
    .map(s => new Date(s.inicio));

  const lunesActual = lunesDe(now);
  const claveActual = claveSemana(lunesActual);
  const unaSemanaMs = 7 * 86400000;

  if (asistidas.length === 0) {
    return { semanas: 0, enRiesgo: false, diasParaPerder: null, claveSemanaActual: claveActual, esMejor: false };
  }

  const semanasConClase = new Set(asistidas.map(d => claveSemana(lunesDe(d))));
  const estaSemanaTieneClase = semanasConClase.has(claveActual);

  let racha = 0;
  let cursor = estaSemanaTieneClase ? lunesActual.getTime() : lunesActual.getTime() - unaSemanaMs;
  while (semanasConClase.has(claveSemana(new Date(cursor)))) {
    racha++;
    cursor -= unaSemanaMs;
  }

  // En riesgo: hay racha de semanas anteriores pero esta semana aún no ha
  // entrenado. El domingo a las 23:59 se acaba el plazo.
  const enRiesgo = racha > 0 && !estaSemanaTieneClase;
  let diasParaPerder: number | null = null;
  if (enRiesgo) {
    const finDeSemana = new Date(lunesActual.getTime() + 6 * 86400000);
    finDeSemana.setHours(23, 59, 59, 999);
    diasParaPerder = Math.max(0, Math.ceil((finDeSemana.getTime() - now.getTime()) / 86400000));
  }

  // ¿Es su mejor marca? Se recorre el historial ordenado contando tramos
  // seguidos. Las claves son 'YYYY-MM-DD', así que ordenan bien como texto.
  const todas = [...semanasConClase].sort();
  const previaDe = (clave: string) =>
    claveSemana(new Date(new Date(clave + 'T12:00:00Z').getTime() - unaSemanaMs));
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
    claveSemanaActual: claveActual,
    esMejor: racha > 0 && racha >= mejor,
  };
}
