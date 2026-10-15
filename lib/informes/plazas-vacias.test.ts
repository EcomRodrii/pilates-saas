import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAXIMO_PLAZAS_VACIAS, UMBRAL_PLAZAS_VACIAS, plazasQueDejaronVacias, rangoDePlazasVacias, textoPlazasVacias,
  type ReservaPlazasVacias,
} from './plazas-vacias.ts';

let n = 0;
/** Una reserva de Tentare, rastreada y con su cobro decidido (llegó a tener plaza). */
const r = (o: Partial<ReservaPlazasVacias> & { socio_id: string; sesion_id: string; estado: string }): ReservaPlazasVacias => ({
  id: `res-${++n}`, creado_en: `2026-10-0${(n % 9) + 1}T10:00:00Z`, origen: 'TENTARE',
  bono_consumo_rastreado: true, bono_decidido_en: '2026-10-01T10:00:00Z', cancelada_tardia: false, cancelada_motivo: null,
  ...o,
});
const tarde = (socio: string, sesion: string, o: Partial<ReservaPlazasVacias> = {}) =>
  r({ socio_id: socio, sesion_id: sesion, estado: 'CANCELADA', cancelada_tardia: true, ...o });
const noVino = (socio: string, sesion: string) => r({ socio_id: socio, sesion_id: sesion, estado: 'NO_ASISTIO' });
const vino = (socio: string, sesion: string) => r({ socio_id: socio, sesion_id: sesion, estado: 'ASISTIDA' });

test('cuenta las tardías y los plantones, con su base, y solo desde el umbral', () => {
  const filas = plazasQueDejaronVacias([
    tarde('ana', 's1'), tarde('ana', 's2'), noVino('ana', 's3'), vino('ana', 's4'), vino('ana', 's5'),
    tarde('bea', 's1'), noVino('bea', 's2'), // 2: no llega
  ]);
  assert.deepEqual(filas, [{ socioId: 'ana', tarde: 2, sinVenir: 1, conPlaza: 5 }]);
  assert.equal(UMBRAL_PLAZAS_VACIAS, 3);
});

test('una espera cerrada, una oferta caducada o una pendiente rechazada NO cuentan: nunca tuvo plaza', () => {
  // Rastreadas y sin `bono_decidido_en`: no llegaron a confirmarse, aunque el trigger les pusiera `cancelada_tardia`.
  const sinPlaza = (s: string) => tarde('ana', s, { bono_decidido_en: null });
  const filas = plazasQueDejaronVacias([sinPlaza('s1'), sinPlaza('s2'), sinPlaza('s3'), noVino('ana', 's4')]);
  assert.deepEqual(filas, []);
});

test('cancelar a tiempo no cuenta; la clase fija retirada y las plataformas tampoco', () => {
  const filas = plazasQueDejaronVacias([
    r({ socio_id: 'ana', sesion_id: 's1', estado: 'CANCELADA', cancelada_tardia: false }),
    tarde('ana', 's2', { cancelada_motivo: 'plaza_fija_retirada' }),
    tarde('ana', 's3', { origen: 'CLASSPASS' }),
    tarde('ana', 's4'), noVino('ana', 's5'),
  ]);
  assert.deepEqual(filas, []);
});

test('cancelar tarde y volver a reservar la MISMA clase no es una plaza vacía; y una clase cuenta una vez', () => {
  const filas = plazasQueDejaronVacias([
    tarde('ana', 's1'), r({ socio_id: 'ana', sesion_id: 's1', estado: 'CONFIRMADA' }), // volvió a esa clase
    tarde('ana', 's2'), tarde('ana', 's2'), // la misma clase dos veces: una
    noVino('ana', 's3'), noVino('ana', 's4'),
  ]);
  assert.deepEqual(filas.map(f => [f.socioId, f.tarde, f.sinVenir]), [['ana', 1, 2]]);
});

test('una reserva sin rastro (importada o legada) se trata como con plaza, como en el barrido de recuperaciones', () => {
  const legada = (s: string) => tarde('ana', s, { bono_consumo_rastreado: null, bono_decidido_en: null });
  assert.equal(plazasQueDejaronVacias([legada('s1'), legada('s2'), legada('s3')])[0]?.tarde, 3);
});

test('orden: más plazas vacías primero, a igualdad más plantones; como mucho cinco', () => {
  const muchas = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((s, i) =>
    Array.from({ length: 3 + i }, (_, k) => noVino(s, `s-${s}-${k}`)));
  const filas = plazasQueDejaronVacias([
    ...muchas,
    tarde('g', 'x1'), tarde('g', 'x2'), tarde('g', 'x3'), tarde('g', 'x4'), tarde('g', 'x5'), tarde('g', 'x6'), tarde('g', 'x7'), tarde('g', 'x8'),
  ]);
  assert.equal(filas.length, MAXIMO_PLAZAS_VACIAS);
  assert.deepEqual(filas.map(f => f.socioId), ['f', 'g', 'e', 'd', 'c']);
});

test('sin alumna no hay fila', () => {
  assert.deepEqual(plazasQueDejaronVacias([
    r({ socio_id: '' as string, sesion_id: 's1', estado: 'NO_ASISTIO' }),
    { ...noVino('x', 's2'), socio_id: null }, { ...noVino('x', 's3'), socio_id: null }, { ...noVino('x', 's4'), socio_id: null },
  ]), []);
});

test('el periodo: dos días válidos, en orden y de un año como mucho', () => {
  assert.deepEqual(rangoDePlazasVacias('2026-01-01', '2026-12-31'), { ok: true, desde: '2026-01-01', hasta: '2026-12-31' });
  assert.equal(rangoDePlazasVacias('2026-10-31', '2026-10-01').ok, false);
  assert.equal(rangoDePlazasVacias('2026-02-30', '2026-03-01').ok, false);
  assert.equal(rangoDePlazasVacias('2025-01-01', '2026-06-01').ok, false);
  assert.equal(rangoDePlazasVacias(null, '2026-06-01').ok, false);
  assert.equal(rangoDePlazasVacias("2026-01-01' or 1=1", '2026-06-01').ok, false);
  assert.equal(rangoDePlazasVacias('0001-01-01', '0001-06-01').ok, false, 'años fuera de lo razonable');
  assert.equal(rangoDePlazasVacias('9999-01-01', '9999-06-01').ok, false);
});

test('guardia: la ruta comprueba quién ve Informes ANTES del interruptor y filtra por el estudio de la sesión', async () => {
  const { readFileSync } = await import('node:fs');
  const ruta = readFileSync(new URL('../../app/api/informes/plazas-vacias/route.ts', import.meta.url), 'utf8');
  const permiso = ruta.indexOf("puedeVer(sesion.rol, '/informes')");
  const interruptor = ruta.indexOf('plazasVaciasEncendido(sesion.studioId)');
  assert.ok(permiso > 0 && interruptor > permiso, 'el permiso va antes: la sonda no es un oráculo');
  assert.match(ruta, /\.eq\('studio_id', studioId\)/);
  assert.match(ruta, /\.eq\('sesiones\.studio_id', studioId\)/, 'y la clase también es de esta sede');
  assert.match(ruta, /const studioId = sesion\.studioId/, 'el estudio sale de la sesión, nunca de la petición');
  const cliente = readFileSync(new URL('./plazas-vacias-cliente.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(cliente, /process\.env|INFORMES_PLAZAS_VACIAS/);
});

test('el texto dice la cifra y la base, sin porcentajes', () => {
  assert.equal(textoPlazasVacias({ socioId: 'a', tarde: 2, sinVenir: 1, conPlaza: 9 }), '2 tarde · 1 sin venir, de 9 reservas');
  assert.equal(textoPlazasVacias({ socioId: 'a', tarde: 0, sinVenir: 3, conPlaza: 3 }), '3 sin venir, de 3 reservas');
  assert.equal(textoPlazasVacias({ socioId: 'a', tarde: 3, sinVenir: 0, conPlaza: 1 }), '3 tarde, de 1 reserva');
  assert.doesNotMatch(textoPlazasVacias({ socioId: 'a', tarde: 2, sinVenir: 1, conPlaza: 9 }), /%/);
});
