import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregadoPublicable, mesEnMadrid, puedeCambiarValoracion, type VotoValoracion } from './agregado.ts';

const voto = (alumna: string, puntuacion: number, creadoEn: string): VotoValoracion => ({ alumna, puntuacion, creadoEn });
const AHORA = new Date('2026-09-14T10:00:00Z');

test('con menos de 5 alumnas distintas no se publica nada, aunque haya muchos votos', () => {
  const votos: VotoValoracion[] = [];
  for (let i = 0; i < 20; i++) votos.push(voto(`a${i % 4}`, 5, `2026-06-${String(1 + i).padStart(2, '0')}T10:00:00Z`));
  assert.equal(agregadoPublicable(votos, AHORA), null);
});

test('el mes en curso no cuenta', () => {
  const votos = ['a', 'b', 'c', 'd', 'e'].map((a) => voto(a, 4, '2026-09-02T10:00:00Z'));
  assert.equal(agregadoPublicable(votos, AHORA), null);
});

test('un mes con pocas alumnas espera y se publica junto al siguiente', () => {
  const votos = [
    voto('a', 5, '2026-07-03T10:00:00Z'), voto('b', 3, '2026-07-10T10:00:00Z'),
    voto('c', 4, '2026-08-01T10:00:00Z'), voto('d', 4, '2026-08-05T10:00:00Z'), voto('e', 4, '2026-08-20T10:00:00Z'),
  ];
  assert.deepEqual(agregadoPublicable(votos, AHORA), { media: 4, total: 5, hasta: '2026-08-31' });
});

test('el mes se decide en hora de Madrid: el 31-ago a las 22:30 UTC ya es septiembre', () => {
  assert.equal(mesEnMadrid('2026-08-31T22:30:00Z'), '2026-09');
  const votos = ['a', 'b', 'c', 'd'].map((a) => voto(a, 5, '2026-08-10T10:00:00Z'));
  votos.push(voto('e', 1, '2026-08-31T22:30:00Z'));
  // Con esa quinta alumna contada en septiembre (mes en curso), agosto no llega al mínimo.
  assert.equal(agregadoPublicable(votos, AHORA), null);
});

test('un voto tardío no mueve lo ya publicado: entra con su fecha, en un bloque nuevo', () => {
  const base = ['a', 'b', 'c', 'd', 'e'].map((a) => voto(a, 4, '2026-07-10T10:00:00Z'));
  const antes = agregadoPublicable(base, new Date('2026-08-15T10:00:00Z'));
  // La alumna «a» cambia de opinión o vota otra clase de julio… pero lo escribe en agosto.
  const despues = agregadoPublicable([...base, voto('a', 1, '2026-08-20T10:00:00Z')], new Date('2026-09-15T10:00:00Z'));
  assert.deepEqual(antes, { media: 4, total: 5, hasta: '2026-07-31' });
  assert.deepEqual(despues, antes, 'agosto tiene una sola alumna: su bloque sigue abierto y no cambia nada');
});

test('la salida nunca dice quién votó', () => {
  const votos = ['a', 'b', 'c', 'd', 'e'].map((a) => voto(a, 5, '2026-07-10T10:00:00Z'));
  const r = agregadoPublicable(votos, AHORA);
  assert.deepEqual(Object.keys(r ?? {}).sort(), ['hasta', 'media', 'total']);
});

test('ignora puntuaciones fuera de 1–5 y fechas rotas', () => {
  const votos = ['a', 'b', 'c', 'd', 'e'].map((a) => voto(a, 4, '2026-07-10T10:00:00Z'));
  votos.push(voto('f', 9, '2026-07-10T10:00:00Z'), voto('g', 3, 'no-es-fecha'));
  assert.deepEqual(agregadoPublicable(votos, AHORA), { media: 4, total: 5, hasta: '2026-07-31' });
});

test('entre dos cierres de mes seguidos, lo que cambia viene siempre de 5 o más alumnas distintas', () => {
  // Un año de votos pseudoaleatorios deterministas, con meses flojos y meses fuertes.
  const votos: VotoValoracion[] = [];
  let semilla = 7;
  const rnd = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  for (let mes = 1; mes <= 12; mes++) {
    const n = Math.floor(rnd() * 9);
    for (let i = 0; i < n; i++) {
      const dia = 1 + Math.floor(rnd() * 27);
      votos.push(voto(`a${Math.floor(rnd() * 12)}`, 1 + Math.floor(rnd() * 5), `2025-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T12:00:00Z`));
    }
  }
  let previo = null as ReturnType<typeof agregadoPublicable>;
  for (let mes = 2; mes <= 13; mes++) {
    const ahora = new Date(Date.UTC(2025, mes - 1, 15, 12));
    const actual = agregadoPublicable(votos, ahora);
    if (actual && (!previo || actual.total !== previo.total)) {
      const desde = previo?.hasta ?? '0000-00-00';
      const nuevos = votos.filter((v) => {
        const dia = v.creadoEn.slice(0, 10);
        return dia > desde && dia <= actual.hasta;
      });
      assert.ok(new Set(nuevos.map((v) => v.alumna)).size >= 5, `cierre ${actual.hasta}: el cambio sale de menos de 5 alumnas`);
    }
    previo = actual;
  }
});

test('una valoración se puede cambiar dentro de su mes, nunca con el mes ya cerrado', () => {
  const ahora = new Date('2026-09-14T10:00:00Z');
  assert.equal(puedeCambiarValoracion('2026-09-02T10:00:00Z', ahora), true);
  assert.equal(puedeCambiarValoracion('2026-08-31T10:00:00Z', ahora), false);
  // En hora de Madrid: el 31-ago a las 22:30 UTC ya es septiembre.
  assert.equal(puedeCambiarValoracion('2026-08-31T22:30:00Z', ahora), true);
  assert.equal(puedeCambiarValoracion('no-es-fecha', ahora), false);
});
