import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDARIOS_OFICIALES,
  aniosConFestivos,
  festivoDe,
  festivosEntre,
  hayCalendario,
  type ZonaFestivos,
} from './oficiales.ts';
import { hoyEnEstudio } from '../utils.ts';

const ZONAS: ZonaFestivos[] = ['CATALUNA', 'ARAN', 'MADRID', 'ANDALUCIA'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

test('cada calendario: fechas reales, del año que dice, en orden, sin repetir y con su fuente', () => {
  for (const c of CALENDARIOS_OFICIALES) {
    const fechas = c.festivos.map((f) => f.fecha);
    for (const f of fechas) {
      assert.match(f, /^\d{4}-\d{2}-\d{2}$/);
      // Una fecha imposible (31-feb) cambiaría al pasar por Date.
      assert.equal(new Date(`${f}T12:00:00Z`).toISOString().slice(0, 10), f, `${c.zona} ${c.anio}: ${f} no existe`);
      assert.equal(Number(f.slice(0, 4)), c.anio);
    }
    assert.deepEqual([...fechas].sort(), fechas, `${c.zona} ${c.anio} desordenado`);
    assert.equal(new Set(fechas).size, fechas.length, `${c.zona} ${c.anio} repite un día`);
    assert.ok(c.fuente.length > 40 && /^https:\/\//.test(c.url), `${c.zona} ${c.anio} sin fuente citada`);
    // El Estatuto permite 14 fiestas al año contando las 2 locales: los seis
    // calendarios publicados traen 12, cada uno contrastado con su boletín.
    assert.equal(fechas.length, 12, `${c.zona} ${c.anio}: ${fechas.length} festivos`);
  }
});

test('2026: los festivos que diferencian a cada comunidad (BOE-A-2025-21667, anexo)', () => {
  assert.equal(festivoDe('ANDALUCIA', '2026-02-28')?.nombre, 'Día de Andalucía');
  assert.equal(festivoDe('MADRID', '2026-02-28'), null);
  assert.equal(festivoDe('MADRID', '2026-05-02')?.nombre, 'Fiesta de la Comunidad de Madrid');
  assert.equal(festivoDe('CATALUNA', '2026-09-11')?.nombre, 'Diada de Cataluña');
  assert.equal(festivoDe('CATALUNA', '2026-04-06')?.nombre, 'Lunes de Pascua');
  assert.equal(festivoDe('CATALUNA', '2026-04-02'), null, 'en Cataluña el Jueves Santo es laborable');
  assert.equal(festivoDe('MADRID', '2026-04-02')?.nombre, 'Jueves Santo');
  // Todos los Santos y la Constitución caen en domingo: Madrid y Andalucía los
  // pasan al lunes; Cataluña no (elige San Juan y San Esteban).
  for (const z of ['MADRID', 'ANDALUCIA'] as const) {
    assert.ok(festivoDe(z, '2026-11-02'));
    assert.ok(festivoDe(z, '2026-12-07'));
  }
  assert.equal(festivoDe('CATALUNA', '2026-11-02'), null);
  assert.equal(festivoDe('CATALUNA', '2026-12-26')?.nombre, 'San Esteban');
});

test('2027: Madrid según el anexo del Decreto 82/2026 (BOCM 1-oct-2026), con sus días de la semana', () => {
  const madrid = festivosEntre('MADRID', '2027-01-01', '2027-12-31');
  // Días de la semana tal como los imprime el anexo.
  const esperado: Record<string, string> = {
    '2027-01-01': 'viernes', '2027-01-06': 'miércoles', '2027-03-19': 'viernes', '2027-05-01': 'sábado',
    '2027-08-16': 'lunes', '2027-10-12': 'martes', '2027-11-01': 'lunes', '2027-12-06': 'lunes',
    '2027-12-08': 'miércoles', '2027-12-25': 'sábado',
  };
  for (const [fecha, dia] of Object.entries(esperado)) {
    assert.ok(madrid.some((f) => f.fecha === fecha), `falta ${fecha}`);
    assert.equal(diaSemana(fecha), dia, fecha);
  }
  assert.equal(festivoDe('MADRID', '2027-05-02'), null, 'el 2 de mayo de 2027 es domingo y no se traslada');
});

test('2027: Andalucía (BOJA 5-may-2026) traslada al lunes el Día de Andalucía y la Asunción', () => {
  assert.equal(diaSemana('2027-02-28'), 'domingo');
  assert.equal(festivoDe('ANDALUCIA', '2027-02-28'), null);
  assert.ok(festivoDe('ANDALUCIA', '2027-03-01'));
  assert.ok(festivoDe('ANDALUCIA', '2027-08-16'));
});

test('2027: Cataluña (DOGC 1-abr-2026) y Arán, que cambia el Lunes de Pascua por el 17 de junio', () => {
  assert.ok(festivoDe('CATALUNA', '2027-03-29'));
  assert.equal(festivoDe('CATALUNA', '2027-06-17'), null);
  assert.equal(festivoDe('ARAN', '2027-03-29'), null);
  assert.equal(festivoDe('ARAN', '2027-06-17')?.nombre, "Festa d'Aran");
  // 2026: en Arán el 17 de junio sustituye a San Esteban.
  assert.equal(festivoDe('ARAN', '2026-12-26'), null);
  assert.ok(festivoDe('ARAN', '2026-06-17'));
});

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano):
// una comprobación independiente de lo copiado, para que una errata en una
// fecha móvil no pase la revisión.
function pascua(anio: number): string {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
const masDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test('Semana Santa cuadra con el domingo de Pascua de cada año', () => {
  assert.equal(pascua(2026), '2026-04-05');
  assert.equal(pascua(2027), '2027-03-28');
  for (const c of CALENDARIOS_OFICIALES) {
    const p = pascua(c.anio);
    for (const f of c.festivos) {
      if (f.nombre === 'Jueves Santo') assert.equal(f.fecha, masDias(p, -3), `${c.zona} ${c.anio}`);
      if (f.nombre === 'Viernes Santo') assert.equal(f.fecha, masDias(p, -2), `${c.zona} ${c.anio}`);
      if (f.nombre === 'Lunes de Pascua') assert.equal(f.fecha, masDias(p, 1), `${c.zona} ${c.anio}`);
    }
  }
});

test('lo que se traslada cae en lunes (y hay cuatro en Madrid y Andalucía)', () => {
  let n = 0;
  for (const c of CALENDARIOS_OFICIALES) {
    for (const f of c.festivos) {
      if (/traslad/i.test(f.nombre)) { n++; assert.equal(diaSemana(f.fecha), 'lunes', `${c.zona} ${f.fecha}`); }
    }
  }
  // 2026: Todos los Santos y la Constitución en Madrid y Andalucía (4); 2027: la
  // Asunción en las dos y el Día de Andalucía (3).
  assert.equal(n, 7);
});

test('Arán: cambia exactamente un festivo por el 17 de junio', () => {
  for (const anio of [2026, 2027]) {
    const cat = festivosEntre('CATALUNA', `${anio}-01-01`, `${anio}-12-31`).map((f) => f.fecha);
    const aran = festivosEntre('ARAN', `${anio}-01-01`, `${anio}-12-31`).map((f) => f.fecha);
    assert.equal(cat.filter((f) => !aran.includes(f)).length, 1, `${anio}`);
    assert.deepEqual(aran.filter((f) => !cat.includes(f)), [`${anio}-06-17`]);
  }
});

test('sin calendario cargado no se inventa nada', () => {
  assert.equal(hayCalendario('MADRID', '2025-12-08'), false);
  assert.deepEqual(festivosEntre('MADRID', '2025-01-01', '2025-12-31'), []);
  assert.equal(hayCalendario('MADRID', '2027-12-08'), true);
});

test('festivosEntre: los dos extremos cuentan y cruza de año', () => {
  const r = festivosEntre('CATALUNA', '2026-12-25', '2027-01-06').map((f) => f.fecha);
  assert.deepEqual(r, ['2026-12-25', '2026-12-26', '2027-01-01', '2027-01-06']);
});

// ⚠️ GUARDIA: desde el 1 de noviembre tiene que estar cargado el año siguiente
// en todas las zonas (el aviso mira 21 días adelante y diciembre ya está ahí).
// Si falla: copiar el calendario del año que viene de su boletín (BOE, DOGC,
// BOCM, BOJA), con su fuente, y nunca de otra parte.
test('guardia: el año siguiente está cargado antes del 1 de noviembre', () => {
  const hoy = hoyEnEstudio();
  const anio = Number(hoy.slice(0, 4));
  const necesarios = hoy.slice(5) >= '11-01' ? [anio, anio + 1] : [anio];
  for (const zona of ZONAS) {
    for (const a of necesarios) {
      assert.ok(aniosConFestivos(zona).includes(a), `Faltan los festivos de ${a} para ${zona}`);
    }
  }
});
