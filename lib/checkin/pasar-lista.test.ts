import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sePasaLista, sesionesQueSeDanPorAsistidas } from './pasar-lista.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Pasar lista por tipo de clase (migr 20260909210000).
//
// Lo que se vigila aquí no es "el override funciona" —eso es `heredaOverride`,
// ya probado— sino las dos decisiones que sí son de este módulo:
//
//  1. **Sin dato, SE PASA lista.** Es el respaldo seguro. Equivocarse hacia
//     `false` daría por asistida a gente que no vino, y con ella créditos,
//     racha, logros y el premio de referido. El error caro va en una dirección.
//  2. **Se resuelve por SESIÓN, no por estudio.** Es el bug que este cambio
//     viene a evitar: si el barrido siguiera mirando solo el estudio, las
//     clases de un tipo con la lista desactivada dentro de un estudio que sí la
//     pasa se quedarían CONFIRMADA para siempre — nadie las marcaría jamás.
// ─────────────────────────────────────────────────────────────────────────────

const sesion = (id: string, studioId: string, tipoClaseId: string | null) => ({ id, studioId, tipoClaseId });

test('sin dato en ningún sitio, se pasa lista', () => {
  // El estudio ni siquiera está en el mapa: es lo que pasa si una consulta
  // devuelve menos filas de las esperadas. No puede volverse "no hace falta".
  assert.equal(sePasaLista(sesion('s1', 'e1', null), new Map(), new Map()), true);
  assert.equal(sePasaLista(sesion('s1', 'e1', 'tc1'), new Map([['e1', null]]), new Map([['tc1', null]])), true);
});

test('el tipo de clase manda sobre el estudio, en las dos direcciones', () => {
  const estudioPasa = new Map([['e1', true]]);
  const estudioNoPasa = new Map([['e1', false]]);

  // El caso que motivó el cambio: estudio que pasa lista, clase que no.
  assert.equal(sePasaLista(sesion('s1', 'e1', 'mat'), estudioPasa, new Map([['mat', false]])), false);
  // Y el contrario: estudio que no la pasa, clase que sí (el Reformer caro).
  assert.equal(sePasaLista(sesion('s1', 'e1', 'reformer'), estudioNoPasa, new Map([['reformer', true]])), true);
});

test('sin override, hereda del estudio', () => {
  const tipos = new Map([['tc1', null]]);
  assert.equal(sePasaLista(sesion('s1', 'e1', 'tc1'), new Map([['e1', false]]), tipos), false);
  assert.equal(sePasaLista(sesion('s1', 'e1', 'tc1'), new Map([['e1', true]]), tipos), true);
});

test('una sesión sin tipo de clase hereda del estudio, no se rompe', () => {
  // `sesiones.tipo_clase_id` es nullable de verdad. Antes de este cambio no
  // había nada que consultar; ahora hay que no ir a buscar un override que no
  // existe.
  assert.equal(sePasaLista(sesion('s1', 'e1', null), new Map([['e1', false]]), new Map([['tc1', true]])), false);
  assert.equal(sePasaLista(sesion('s1', 'e1', null), new Map([['e1', true]]), new Map([['tc1', false]])), true);
});

test('el barrido solo se lleva las sesiones donde NO se pasa lista', () => {
  const estudios = new Map([['e1', true], ['e2', false]]);
  const tipos = new Map<string, boolean | null>([['mat', false], ['reformer', true], ['libre', null]]);

  const ids = sesionesQueSeDanPorAsistidas([
    sesion('a', 'e1', 'mat'),       // estudio pasa, clase no → se da por asistida
    sesion('b', 'e1', 'reformer'),  // las dos pasan → no
    sesion('c', 'e1', 'libre'),     // hereda de e1 (pasa) → no
    sesion('d', 'e2', 'reformer'),  // estudio no pasa, clase sí → no
    sesion('e', 'e2', 'libre'),     // hereda de e2 (no pasa) → sí
    sesion('f', 'e2', null),        // sin tipo, hereda de e2 → sí
  ], estudios, tipos);

  assert.deepEqual(ids.sort(), ['a', 'e', 'f']);
});

// ── Que los DOS barridos usen esta misma regla ──────────────────────────────
//
// Hay dos que deciden sobre las mismas reservas y en direcciones opuestas:
// `marcarAsistidasAutomaticamente` (cada 30 min) las marca ASISTIDA, y
// `barrerNoShows` (cada noche) las marca NO_ASISTIO. Si uno de los dos deja de
// consultar esta regla —o la reescribe por su cuenta y diverge—, vuelve el
// fallo que este módulo cerró: a quien fue a una clase sin lista se le marca
// falta, y el trigger de penalización se la cobra.
//
// No lo ve ningún compilador: son dos ficheros distintos que casualmente
// coinciden. Se comprueba leyéndolos, mismo enfoque que
// `rpc-columnas-declaradas.test.ts`.
test('los dos barridos de asistencia deciden con esta misma regla', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  const consumidores = [
    'lib/checkin/marcar-asistidas-automatico.ts',
    'lib/db/supabase-data-admin.ts',
  ];
  for (const f of consumidores) {
    const fuente = readFileSync(join(raiz, f), 'utf8');
    assert.match(
      fuente, /sesionesQueSeDanPorAsistidas/,
      `${f}: ya no usa la regla compartida — o la reimplementó (divergirán), o dejó de mirarla `
      + '(volverá a marcar faltas en clases donde no se pasa lista)',
    );
  }
});

test('un estudio que no está en el mapa no arrastra a sus sesiones', () => {
  // Defensa en profundidad: si la consulta de estudios se quedara corta
  // (paginación, borrado a medias), lo seguro es NO darlas por asistidas.
  const ids = sesionesQueSeDanPorAsistidas([sesion('a', 'desconocido', null)], new Map(), new Map());
  assert.deepEqual(ids, []);
});
