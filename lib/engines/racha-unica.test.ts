import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  calcularRachaUnica, semanasCandidatasSinClases,
  type EntradaRacha, type HechoClase, type RangoFechas,
} from './streak-engine.ts';
import { masDias } from '../utils.ts';

// Los 13 casos de la tabla de «Semana y racha únicas» (Fase 3, PR 3.3) con las
// reglas aprobadas por el fundador. La racha se lee «tras cerrar cada semana»:
// el lunes siguiente a media mañana, cuando la semana en curso aún está vacía.
// Las clases van el martes a las 17:00 UTC (18-19 h de Madrid: mismo día en
// cualquier huso). Se ejecuta con TZ=UTC y TZ=Europe/Madrid (npm test corre en
// el del sistema) y el último test lo repite en tres husos en procesos aparte.

const asiste = (lunes: string): HechoClase => ({
  inicio: `${masDias(lunes, 1)}T17:00:00Z`, estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true,
});
const claseConEstado = (lunes: string, extra: Partial<HechoClase>): HechoClase => ({
  inicio: `${masDias(lunes, 1)}T17:00:00Z`, estado: 'CONFIRMADA', sesionCancelada: false, sesionConLista: true, ...extra,
});

function entrada(clases: HechoClase[], now: Date, extra: Partial<EntradaRacha> = {}): EntradaRacha {
  return { clases, cierres: [], pausas: [], semanasSinClases: new Set(), now, ...extra };
}
/** Racha tras cerrar la semana de `lunes` (lectura del lunes siguiente por la mañana). */
function tras(clases: HechoClase[], lunes: string, extra: Partial<EntradaRacha> = {}): number {
  const now = new Date(`${masDias(lunes, 7)}T09:00:00Z`);
  // Lo que ya había pasado a esa hora: el calendario del caso se va «viviendo».
  return calcularRachaUnica(entrada(clases.filter((c) => new Date(c.inicio) < now), now, extra)).semanas;
}
function serie(clases: HechoClase[], lunes: string[], extra: Partial<EntradaRacha> = {}): number[] {
  return lunes.map((l) => tras(clases, l, extra));
}
const lunes = (desde: string, n: number) => Array.from({ length: n }, (_, i) => masDias(desde, 7 * i));

test('caso 1 — normal, 6 semanas', () => {
  const sem = lunes('2026-09-07', 6);
  assert.deepEqual(serie(sem.map(asiste), sem), [1, 2, 3, 4, 5, 6]);
});

test('caso 2a — una falta con racha de 5: el respiro ganado la mantiene', () => {
  const sem = lunes('2026-09-07', 8);
  const clases = sem.filter((l) => l !== '2026-10-12').map(asiste);
  assert.deepEqual(serie(clases, sem), [1, 2, 3, 4, 5, 5, 6, 7]);
});

test('caso 2b — una falta con racha de 2: sin respiro, vuelve a 0', () => {
  const sem = lunes('2026-09-07', 4);
  const clases = [sem[0], sem[1], sem[3]].map(asiste);
  assert.deepEqual(serie(clases, sem), [1, 2, 0, 1]);
});

test('caso 3 — vacaciones del estudio (dos semanas): neutras', () => {
  const sem = lunes('2026-09-07', 6);
  const cierres: RangoFechas[] = [{ desde: '2026-09-21', hasta: '2026-10-04' }];
  const clases = [sem[0], sem[1], sem[4], sem[5]].map(asiste);
  assert.deepEqual(serie(clases, sem, { cierres }), [1, 2, 2, 2, 3, 4]);
});

test('caso 3b — un cierre de UN solo día de la semana ya la hace neutra', () => {
  const sem = lunes('2026-09-07', 3);
  const cierres: RangoFechas[] = [{ desde: '2026-09-24', hasta: '2026-09-24' }]; // jueves de la 3.ª
  assert.deepEqual(serie([sem[0], sem[1]].map(asiste), sem, { cierres }), [1, 2, 2]);
});

test('caso 4 — clase suya cancelada por el estudio: neutra', () => {
  const sem = lunes('2026-09-07', 5);
  const cancelada = claseConEstado('2026-09-21', { estado: 'CONFIRMADA', sesionCancelada: true });
  const clases = [asiste(sem[0]), asiste(sem[1]), cancelada, asiste(sem[3]), asiste(sem[4])];
  assert.deepEqual(serie(clases, sem), [1, 2, 2, 3, 4]);
});

test('caso 4b — la clase cancelada por el estudio se mira ANTES que la «tardía»', () => {
  // Hay reservas marcadas tardías en clases que canceló el estudio: no son falta ni rompen.
  const sem = lunes('2026-09-07', 3);
  const clases = [asiste(sem[0]), asiste(sem[1]),
    claseConEstado(sem[2], { estado: 'CANCELADA', canceladaTardia: true, sesionCancelada: true })];
  const r = calcularRachaUnica(entrada(clases, new Date('2026-09-28T09:00:00Z')));
  assert.equal(r.semanas, 2);
  assert.equal(r.detalle[2].estado, 'neutra');
  assert.equal(r.detalle[2].faltas, 0);
});

test('caso 5 — cuota congelada / plaza en pausa (dos semanas): neutras', () => {
  const sem = lunes('2026-09-07', 6);
  const pausas: RangoFechas[] = [{ desde: '2026-09-22', hasta: '2026-10-03' }];
  const clases = [sem[0], sem[1], sem[4], sem[5]].map(asiste);
  assert.deepEqual(serie(clases, sem, { pausas }), [1, 2, 2, 2, 3, 4]);
});

test('caso 5b — congelación abierta (sin fecha de fin) cubre todo lo posterior', () => {
  const sem = lunes('2026-09-07', 4);
  const pausas: RangoFechas[] = [{ desde: '2026-09-21', hasta: null }];
  assert.deepEqual(serie([sem[0], sem[1]].map(asiste), sem, { pausas }), [1, 2, 2, 2]);
});

test('casos 6/7/8 — cancelar a tiempo, cancelar tarde o no presentarse (con lista): la semana falla igual', () => {
  const sem = lunes('2026-09-07', 3);
  const ok = [sem[0], sem[1]].map(asiste);
  const conRespiro = lunes('2026-09-07', 6);
  for (const extra of [
    { estado: 'CANCELADA' as const }, // a tiempo
    { estado: 'CANCELADA' as const, canceladaTardia: true }, // tardía
    { estado: 'NO_ASISTIO' as const, sesionConLista: true }, // no-show con lista
  ]) {
    // Racha 2 sin respiro: 0 en las tres.
    assert.deepEqual(serie([...ok, claseConEstado(sem[2], extra)], sem), [1, 2, 0]);
    // Racha 4 (respiro ganado): se mantiene en 4 y la siguiente suma 5.
    const cuatro = conRespiro.slice(0, 4).map(asiste);
    const s = [...cuatro, claseConEstado(conRespiro[4], extra), asiste(conRespiro[5])];
    assert.deepEqual(serie(s, conRespiro), [1, 2, 3, 4, 4, 5]);
  }
});

test('caso 7 — la cancelación tardía es falta del historial pero no rompe por sí sola', () => {
  const sem = lunes('2026-09-07', 2);
  const clases = [asiste(sem[0]), claseConEstado(sem[0], { estado: 'CANCELADA', canceladaTardia: true }), asiste(sem[1])];
  const r = calcularRachaUnica(entrada(clases, new Date('2026-09-21T09:00:00Z')));
  assert.equal(r.semanas, 2);
  assert.equal(r.detalle[0].faltas, 1); // falta registrada, semana completa igualmente
  assert.equal(r.detalle[0].estado, 'completa');
});

test('caso 8b — clase donde no se pasó lista (nadie ASISTIDA): neutra', () => {
  const sem = lunes('2026-09-07', 4);
  const sinLista = claseConEstado(sem[2], { estado: 'NO_ASISTIO', sesionConLista: false });
  assert.deepEqual(serie([asiste(sem[0]), asiste(sem[1]), sinLista, asiste(sem[3])], sem), [1, 2, 2, 3]);
});

test('caso 9 — cambio de hora 25-oct-2026: la clase del lunes 00:30 de Madrid es de ESA semana', () => {
  const clases: HechoClase[] = [
    asiste('2026-10-12'), asiste('2026-10-19'),
    { inicio: '2026-10-25T23:30:00Z', estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true }, // lun 26 00:30 Madrid (CET)
    asiste('2026-11-02'),
  ];
  const lee = (iso: string) => {
    const now = new Date(iso);
    return calcularRachaUnica(entrada(clases.filter((c) => new Date(c.inicio) < now), now)).semanas;
  };
  assert.equal(lee('2026-10-25T22:00:00Z'), 2); // domingo 23:00 Madrid: aún no ha ido
  assert.equal(lee('2026-10-26T09:00:00Z'), 3); // lunes por la mañana: ya fue (00:30), es de la semana del 26
  assert.equal(lee('2026-11-04T09:00:00Z'), 4);
  const r = calcularRachaUnica(entrada(clases, new Date('2026-11-04T09:00:00Z')));
  assert.deepEqual(r.detalle.map((d) => d.clave), ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
});

test('caso 9b — cambio de primavera 28-mar-2027: domingo 23:30 es de la semana que termina', () => {
  const clases: HechoClase[] = [
    asiste('2027-03-15'),
    { inicio: '2027-03-28T21:30:00Z', estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true }, // dom 28 23:30 Madrid (CEST)
    { inicio: '2027-03-28T22:30:00Z', estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true }, // lun 29 00:30 Madrid: semana siguiente
  ];
  const r = calcularRachaUnica(entrada(clases, new Date('2027-04-05T09:00:00Z')));
  assert.deepEqual(r.detalle.slice(0, 3).map((d) => [d.clave, d.validas]), [['2027-03-15', 1], ['2027-03-22', 1], ['2027-03-29', 1]]);
  assert.equal(r.semanas, 3);
});

test('caso 10 — cruce de año con cierre de Navidad', () => {
  const sem = ['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11'];
  const cierres: RangoFechas[] = [{ desde: '2026-12-24', hasta: '2027-01-03' }];
  const clases = [sem[0], sem[1], sem[3], sem[4]].map(asiste);
  assert.deepEqual(serie(clases, sem, { cierres }), [1, 2, 2, 3, 4]);
});

test('caso 10b — sin cierre, la semana 28-dic → 3-ene es UNA sola semana (no hay reinicio el 1 de enero)', () => {
  const clases: HechoClase[] = [
    { inicio: '2026-12-30T17:00:00Z', estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true },
    { inicio: '2027-01-02T10:00:00Z', estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true },
  ];
  const r = calcularRachaUnica(entrada(clases, new Date('2027-01-04T09:00:00Z')));
  assert.equal(r.detalle.length, 2); // la semana 12-28 y la en curso (01-04)
  assert.equal(r.detalle[0].validas, 2);
  assert.equal(r.semanas, 1);
});

test('casos 11 y 12 — con la meta fija en 1 no hay «meta nueva» ni semana de alta que proteger', () => {
  // Se apunta el jueves y va a una clase: la semana está completa y la racha es 1.
  const clases: HechoClase[] = [{ inicio: '2026-09-10T17:00:00Z', estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true }];
  const r = calcularRachaUnica(entrada(clases, new Date('2026-09-14T09:00:00Z')));
  assert.equal(r.semanas, 1);
  assert.equal(r.semanaEnCurso.meta, 1);
});

test('caso 13 — estudio sin pase de lista: lo que el barrido pasa a ASISTIDA cuenta (limitación documentada)', () => {
  const sem = lunes('2026-09-07', 2);
  assert.deepEqual(serie(sem.map(asiste), sem), [1, 2]);
});

// ── reglas que los 13 casos no aíslan ────────────────────────────────────────

test('CONFIRMADA de una clase ya terminada es «por confirmar»: no suma, y en semana cerrada no rompe', () => {
  const sem = lunes('2026-09-07', 3);
  const porConfirmar = claseConEstado(sem[2], { estado: 'CONFIRMADA' });
  const r = calcularRachaUnica(entrada([asiste(sem[0]), asiste(sem[1]), porConfirmar], new Date('2026-09-28T09:00:00Z')));
  assert.equal(r.semanas, 2);
  assert.equal(r.detalle[2].estado, 'neutra');
});

test('la semana en curso nunca rompe: el lunes por la mañana la racha sigue entera', () => {
  const sem = lunes('2026-09-07', 3);
  const r = calcularRachaUnica(entrada(sem.map(asiste), new Date('2026-09-28T09:00:00Z')));
  assert.equal(r.semanas, 3);
  assert.equal(r.semanaEnCurso.estado, 'pendiente');
  assert.equal(r.enRiesgo, false); // D6: «racha en riesgo» no se construye
  assert.equal(r.diasParaPerder, null);
});

test('semana en curso: reservada (clase futura), hecha (asistida) y pendiente', () => {
  const ahora = new Date('2026-09-29T09:00:00Z'); // martes
  const futura = claseConEstado('2026-09-28', { inicio: '2026-09-30T17:00:00Z' });
  assert.equal(calcularRachaUnica(entrada([asiste('2026-09-21'), futura], ahora)).semanaEnCurso.estado, 'reservada');
  assert.equal(calcularRachaUnica(entrada([asiste('2026-09-21'), asiste('2026-09-28')], ahora)).semanaEnCurso.estado, 'hecha');
  assert.equal(calcularRachaUnica(entrada([asiste('2026-09-21')], ahora)).semanaEnCurso.estado, 'pendiente');
});

test('una clase en una lista de espera o pendiente de aprobar no existe para la racha', () => {
  const sem = lunes('2026-09-07', 2);
  const clases = [asiste(sem[0]), claseConEstado(sem[1], { estado: 'LISTA_ESPERA' })];
  const r = calcularRachaUnica(entrada(clases, new Date('2026-09-21T09:00:00Z')));
  assert.equal(r.semanas, 0); // la 2.ª semana, fallida y sin respiro
});

test('respiro: máximo 1 guardado, se gasta con la primera falta y la segunda ya rompe', () => {
  const sem = lunes('2026-09-07', 11);
  // 8 completas seguidas (respiro ganado en la 4.ª y otra vez en la 8.ª: sigue siendo 1), 2 fallos, 1 más.
  const clases = sem.slice(0, 8).map(asiste).concat([asiste(sem[10])]);
  assert.deepEqual(serie(clases, sem), [1, 2, 3, 4, 5, 6, 7, 8, 8, 0, 1]);
  const r8 = calcularRachaUnica(entrada(clases, new Date(`${masDias(sem[7], 7)}T09:00:00Z`)));
  assert.equal(r8.respiroDisponible, true);
  assert.equal(r8.mejor, 8);
  const rFinal = calcularRachaUnica(entrada(clases, new Date(`${masDias(sem[10], 7)}T09:00:00Z`)));
  assert.equal(rFinal.mejor, 8);
  assert.equal(rFinal.esMejor, false);
});

test('haciaRespiro cuenta 0–3 semanas completas seguidas', () => {
  const sem = lunes('2026-09-07', 6);
  const r = calcularRachaUnica(entrada(sem.map(asiste), new Date(`${masDias(sem[5], 7)}T09:00:00Z`)));
  assert.equal(r.respiroDisponible, true);
  assert.equal(r.haciaRespiro, 2);
});

test('sin_clases: el estudio no ofreció ninguna clase esa semana → neutra; y el cargador sabe qué semanas preguntar', () => {
  const sem = lunes('2026-09-07', 4);
  const clases = [sem[0], sem[1], sem[3]].map(asiste);
  const ahora = new Date(`${masDias(sem[3], 7)}T09:00:00Z`);
  const base = { clases, cierres: [], pausas: [], now: ahora };
  assert.deepEqual(semanasCandidatasSinClases(base), ['2026-09-21']);
  assert.equal(calcularRachaUnica({ ...base, semanasSinClases: new Set() }).semanas, 1);
  assert.equal(calcularRachaUnica({ ...base, semanasSinClases: new Set(['2026-09-21']) }).semanas, 3);
});

test('semanasCandidatasSinClases no pregunta por semanas ya explicadas (cierre, clase cancelada, pausa, sin lista)', () => {
  const sem = lunes('2026-09-07', 6);
  const clases = [asiste(sem[0]),
    claseConEstado(sem[2], { estado: 'CONFIRMADA', sesionCancelada: true }),
    claseConEstado(sem[3], { estado: 'NO_ASISTIO', sesionConLista: false }),
    asiste(sem[5])];
  const base = {
    clases, now: new Date(`${masDias(sem[5], 7)}T09:00:00Z`),
    cierres: [{ desde: sem[1], hasta: sem[1] }], pausas: [{ desde: sem[4], hasta: masDias(sem[4], 2) }],
  };
  assert.deepEqual(semanasCandidatasSinClases(base), []);
});

test('sin ninguna asistencia válida: racha 0, detalle vacío y la semana en curso pendiente', () => {
  const r = calcularRachaUnica(entrada([], new Date('2026-09-29T09:00:00Z')));
  assert.equal(r.semanas, 0);
  assert.deepEqual(r.detalle, []);
  assert.equal(r.semanaEnCurso.estado, 'pendiente');
});

test('dos reservas ASISTIDA de la misma semana no pintan «2 de 1»', () => {
  const clases = [asiste('2026-09-21'), asiste('2026-09-21')];
  const r = calcularRachaUnica(entrada(clases, new Date('2026-09-23T09:00:00Z')));
  assert.equal(r.semanaEnCurso.hechas, 1);
  assert.equal(r.semanas, 1);
});

test('ASISTIDA y cancelación tardía en la misma semana: completa, con la falta anotada', () => {
  const clases = [asiste('2026-09-14'), claseConEstado('2026-09-14', { estado: 'CANCELADA', canceladaTardia: true })];
  const r = calcularRachaUnica(entrada(clases, new Date('2026-09-21T09:00:00Z')));
  assert.equal(r.detalle[0].estado, 'completa');
  assert.equal(r.detalle[0].faltas, 1);
});

test('el orden de entrada no importa', () => {
  const sem = lunes('2026-09-07', 5);
  const clases = sem.filter((l) => l !== sem[2]).map(asiste);
  const ahora = new Date(`${masDias(sem[4], 7)}T09:00:00Z`);
  assert.deepEqual(calcularRachaUnica(entrada([...clases].reverse(), ahora)), calcularRachaUnica(entrada(clases, ahora)));
});

test('el caso 9 da 3 en cualquier huso del servidor (UTC, Madrid, Nueva York), en procesos aparte', () => {
  const motor = fileURLToPath(new URL('./streak-engine.ts', import.meta.url));
  const script = `
    import { calcularRachaUnica } from ${JSON.stringify(motor)};
    const c = (inicio) => ({ inicio, estado: 'ASISTIDA', sesionCancelada: false, sesionConLista: true });
    const r = calcularRachaUnica({
      clases: [c('2026-10-13T17:00:00Z'), c('2026-10-20T17:00:00Z'), c('2026-10-25T23:30:00Z')],
      cierres: [], pausas: [], semanasSinClases: new Set(), now: new Date('2026-10-27T10:00:00Z'),
    });
    console.log(r.semanas);
  `;
  for (const TZ of ['UTC', 'Europe/Madrid', 'America/New_York']) {
    const out = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(out.stdout.trim(), '3', `TZ=${TZ}: ${out.stderr}`);
  }
});
