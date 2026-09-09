import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('un estudio que no está en el mapa no arrastra a sus sesiones', () => {
  // Defensa en profundidad: si la consulta de estudios se quedara corta
  // (paginación, borrado a medias), lo seguro es NO darlas por asistidas.
  const ids = sesionesQueSeDanPorAsistidas([sesion('a', 'desconocido', null)], new Map(), new Map());
  assert.deepEqual(ids, []);
});
