import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  codigoDeRevisionCoincide, codigoTrivial, configAccesoRevision, esEmailDeRevision, intentarAccesoRevision,
  type DepsRevision,
} from './acceso-revision.ts';
import { VINCULOS_CUENTA } from '../socios/borrado-cuenta.ts';

const ENV = { APP_REVIEW_EMAIL: '  Revision@Example.com ', APP_REVIEW_CODIGO: '480913', APP_REVIEW_STUDIO_ID: 'estudio-demo' };
const CFG = configAccesoRevision(ENV)!;
const SESION = { access_token: 'a.b.c', refresh_token: 'r' };

/** Solo alumna: ningún vínculo salvo sus fichas de socia. */
const soloAlumna = () => Object.fromEntries(VINCULOS_CUENTA.map((v) => [v.clave, v.clave === 'otras_fichas_socia' ? 1 : 0]));

function deps(cambios: Partial<DepsRevision> = {}) {
  const avisos: Array<{ evento: string; motivo?: string; userId?: string }> = [];
  const emitidas: string[] = [];
  const blindadas: string[] = [];
  const fichas: string[] = [];
  const d: DepsRevision = {
    contarIntento: async () => ({ permitido: true, contado: true }),
    buscarCuenta: async () => 'u-demo',
    leerUsuario: async (id) => ({ id, email: 'revision@example.com', bloqueadoHasta: null }),
    factoresVerificados: async () => 0,
    vinculos: async () => soloAlumna(),
    tieneFicha: async (_id, _email, studioId) => { fichas.push(studioId); return true; },
    emitirSesion: async (id, email) => { emitidas.push(`${id}:${email}`); return SESION; },
    blindarCuenta: async (id, token) => { blindadas.push(`${id}:${token}`); },
    avisar: (evento, datos) => { avisos.push({ evento, ...datos }); },
    ...cambios,
  };
  return { d, avisos, emitidas, blindadas, fichas };
}

test('sin las tres variables, o con un código flojo, el acceso de revisión no existe', () => {
  assert.equal(configAccesoRevision({}), null);
  assert.equal(configAccesoRevision({ ...ENV, APP_REVIEW_EMAIL: undefined }), null);
  assert.equal(configAccesoRevision({ ...ENV, APP_REVIEW_CODIGO: undefined }), null);
  assert.equal(configAccesoRevision({ ...ENV, APP_REVIEW_STUDIO_ID: undefined }), null);
  assert.equal(configAccesoRevision({ ...ENV, APP_REVIEW_STUDIO_ID: 'a,b' }), null);
  assert.equal(configAccesoRevision({ ...ENV, APP_REVIEW_EMAIL: 'no-es-un-email' }), null);
  for (const malo of ['12345', '1234567', 'abcdef', '48 913', '000000', '777777', '123456', '654321', '012345', '345678']) {
    assert.equal(configAccesoRevision({ ...ENV, APP_REVIEW_CODIGO: malo }), null, malo);
  }
  assert.deepEqual(CFG, { email: 'revision@example.com', codigo: '480913', studioId: 'estudio-demo' });
});

test('códigos triviales', () => {
  assert.ok(codigoTrivial('111111'));
  assert.ok(codigoTrivial('987654'));
  assert.ok(!codigoTrivial('480913'));
  assert.ok(!codigoTrivial('121212'));
});

test('solo ese email exacto (mayúsculas y espacios aparte)', () => {
  assert.ok(esEmailDeRevision(CFG, 'REVISION@example.com '));
  assert.ok(!esEmailDeRevision(CFG, 'revision@example.co'));
  assert.ok(!esEmailDeRevision(CFG, 'revision+1@example.com'));
  assert.ok(!esEmailDeRevision(CFG, 'otra@example.com'));
});

test('el código se compara entero', () => {
  assert.ok(codigoDeRevisionCoincide(CFG, '480913'));
  assert.ok(!codigoDeRevisionCoincide(CFG, '480914'));
  assert.ok(!codigoDeRevisionCoincide(CFG, '48091'));
  assert.ok(!codigoDeRevisionCoincide(CFG, '4809130'));
  assert.ok(!codigoDeRevisionCoincide(CFG, ''));
});

test('con la cuenta de demo y su código: sesión de ESA cuenta, ficha en SU estudio, cuenta blindada y rastro', async () => {
  const { d, avisos, emitidas, blindadas, fichas } = deps();
  const r = await intentarAccesoRevision(CFG, ' Revision@example.com', '480913', d);
  assert.deepEqual(r, { tipo: 'ok', userId: 'u-demo', session: SESION });
  assert.deepEqual(emitidas, ['u-demo:revision@example.com']);
  assert.deepEqual(fichas, ['estudio-demo']);
  assert.deepEqual(blindadas, ['u-demo:a.b.c']);
  assert.deepEqual(avisos, [{ evento: 'entrada', userId: 'u-demo' }]);
});

test('otro email, aunque traiga el código fijo: camino de siempre, sin tocar nada', async () => {
  let contado = false;
  const { d, emitidas } = deps({ contarIntento: async () => { contado = true; return { permitido: true, contado: true }; } });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'otra@example.com', '480913', d), { tipo: 'no_aplica' });
  assert.equal(contado, false);
  assert.deepEqual(emitidas, []);
});

test('sin configuración: camino de siempre', async () => {
  const { d, emitidas } = deps();
  assert.deepEqual(await intentarAccesoRevision(null, 'revision@example.com', '480913', d), { tipo: 'no_aplica' });
  assert.deepEqual(emitidas, []);
});

test('la demo con otro código: camino de siempre (el código del correo sigue valiendo), y el intento cuenta', async () => {
  let intentos = 0;
  const { d, emitidas } = deps({ contarIntento: async () => { intentos++; return { permitido: true, contado: true }; } });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480914', d), { tipo: 'no_aplica' });
  assert.equal(intentos, 1);
  assert.deepEqual(emitidas, []);
});

test('tope diario agotado, o sin poder contar: el código fijo deja de valer y contesta igual que uno malo', async () => {
  for (const intento of [{ permitido: false, contado: true }, { permitido: true, contado: false }]) {
    const { d, emitidas, avisos } = deps({ contarIntento: async () => intento });
    // El bueno y uno malo siguen el MISMO camino (el del correo): el tiempo no delata cuál es.
    assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', d), { tipo: 'no_aplica' });
    assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '111222', d), { tipo: 'no_aplica' });
    assert.deepEqual(emitidas, []);
    assert.deepEqual(avisos, [{ evento: 'rechazo', motivo: 'limite_diario' }]);
  }
  const { d, emitidas } = deps({ contarIntento: async () => { throw new Error('rpc'); } });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', d), { tipo: 'no_aplica' });
  assert.deepEqual(emitidas, []);
});

test('no se salta la verificación en dos pasos: una cuenta con factor verificado no entra', async () => {
  const { d, emitidas } = deps({ factoresVerificados: async () => 1 });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', d), { tipo: 'rechazado', motivo: 'doble_factor' });
  assert.deepEqual(emitidas, []);
});

test('solo una cuenta que es solo alumna: ni equipo, ni dueña, ni Tentare, ni Network', async () => {
  for (const clave of ['instructora', 'duena_estudio', 'duena_cadena', 'admin_plataforma', 'permiso_plataforma', 'perfil_network']) {
    const { d, emitidas } = deps({ vinculos: async () => ({ ...soloAlumna(), [clave]: 1 }) });
    assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', d), { tipo: 'rechazado', motivo: 'no_solo_alumna' }, clave);
    assert.deepEqual(emitidas, []);
  }
  // Un vínculo que no se pudo contar no da vía libre.
  const { d } = deps({ vinculos: async () => ({ ...soloAlumna(), instructora: null }) });
  assert.equal((await intentarAccesoRevision(CFG, 'revision@example.com', '480913', d)).tipo, 'rechazado');
});

test('no crea cuentas ni entra sin ficha de alumna', async () => {
  const sinCuenta = deps({ buscarCuenta: async () => null });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', sinCuenta.d), { tipo: 'rechazado', motivo: 'sin_cuenta' });
  assert.deepEqual(sinCuenta.emitidas, []);
  const sinFicha = deps({ tieneFicha: async () => false });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', sinFicha.d), { tipo: 'rechazado', motivo: 'sin_ficha' });
});

test('la cuenta tiene que ser la de ese email y no estar bloqueada', async () => {
  const otra = deps({ leerUsuario: async (id) => ({ id, email: 'otra@example.com', bloqueadoHasta: null }) });
  assert.equal((await intentarAccesoRevision(CFG, 'revision@example.com', '480913', otra.d)).tipo, 'rechazado');
  const ahora = () => new Date('2026-10-07T12:00:00Z');
  const bloqueada = deps({ ahora, leerUsuario: async (id) => ({ id, email: 'revision@example.com', bloqueadoHasta: '2026-10-08T00:00:00Z' }) });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', bloqueada.d), { tipo: 'rechazado', motivo: 'cuenta_bloqueada' });
  const yaNo = deps({ ahora, leerUsuario: async (id) => ({ id, email: 'revision@example.com', bloqueadoHasta: '2026-10-01T00:00:00Z' }) });
  assert.equal((await intentarAccesoRevision(CFG, 'revision@example.com', '480913', yaNo.d)).tipo, 'ok');
});

test('cualquier fallo de I/O cierra, y el rechazo deja rastro sin el email ni el código', async () => {
  const { d, avisos } = deps({ factoresVerificados: async () => { throw new Error('auth caído'); } });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', d), { tipo: 'rechazado', motivo: 'error' });
  assert.deepEqual(avisos, [{ evento: 'rechazo', motivo: 'error', userId: 'u-demo' }]);
  assert.ok(!JSON.stringify(avisos).includes('example.com'));
  assert.ok(!JSON.stringify(avisos).includes('480913'));
  const sinSesion = deps({ emitirSesion: async () => null });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', sinSesion.d), { tipo: 'rechazado', motivo: 'sin_sesion' });
  assert.deepEqual(sinSesion.blindadas, []);
  // Sin poder blindar la cuenta, la sesión no se entrega.
  const sinBlindar = deps({ blindarCuenta: async () => { throw new Error('auth'); } });
  assert.deepEqual(await intentarAccesoRevision(CFG, 'revision@example.com', '480913', sinBlindar.d), { tipo: 'rechazado', motivo: 'error' });
});

test('la única puerta es /api/auth/otp/verificar, y va después de sus límites de intentos', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  const usos: string[] = [];
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n.startsWith('.')) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.(ts|tsx)$/.test(n) && !n.endsWith('.test.ts') && /from '[^']*acceso-revision-servidor(\.ts)?'/.test(readFileSync(p, 'utf8'))) {
        usos.push(p.slice(raiz.length + 1));
      }
    }
  };
  for (const d of ['app', 'lib', 'components']) recorrer(join(raiz, d));
  assert.deepEqual(usos, ['app/api/auth/otp/verificar/route.ts']);

  const ruta = readFileSync(join(raiz, 'app/api/auth/otp/verificar/route.ts'), 'utf8');
  const i = ruta.indexOf('await accesoRevision(');
  assert.ok(i > ruta.indexOf("enforceRateLimit(req, 'otp-verify'"));
  assert.ok(i > ruta.indexOf('if (!porEmail.allowed)'));
});
