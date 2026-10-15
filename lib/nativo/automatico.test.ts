import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  argumentosDeClave, certificadosNuevos, estadoDeBuild, faseDeVersion, pasoDe, urlDeFicha, type AppParaTramitar,
} from './automatico.ts';

const app = (extra: Partial<AppParaTramitar> = {}): AppParaTramitar => ({
  studioId: 's1', slug: 'luz', bundleId: 'app.tentare.cupo-001', ascAppId: '6823157562', nombreApp: 'Luz',
  estado: 'PEDIDA', activa: false, urlTienda: null, pagada: true, ...extra,
});

test('pedida: con hueco se prepara; sin hueco (creada a mano) avisa a una persona', () => {
  assert.deepEqual(pasoDe(app()), { tipo: 'preparar' });
  assert.deepEqual(pasoDe(app({ ascAppId: null })), { tipo: 'avisar', motivo: 'sin-hueco' });
});

test('sin pagar o en pausa, no se toca nada (ni se gasta una compilación)', () => {
  assert.deepEqual(pasoDe(app({ pagada: false })), { tipo: 'nada' });
  assert.deepEqual(pasoDe(app({ estado: 'PAUSADA', activa: true })), { tipo: 'nada' });
});

test('en preparación: compila si no hay compilación o falló; pasa a pruebas cuando Apple la da por buena', () => {
  const prep = app({ estado: 'EN_PREPARACION', activa: true });
  assert.deepEqual(pasoDe(prep, { build: 'ninguna' }), { tipo: 'compilar' });
  assert.deepEqual(pasoDe(prep, { build: 'fallida' }), { tipo: 'compilar' });
  assert.deepEqual(pasoDe(prep, { build: 'procesando' }), { tipo: 'nada' });
  assert.deepEqual(pasoDe(prep, { build: 'valida' }), { tipo: 'cambiar', estado: 'EN_PRUEBAS', evento: 'probando' });
  // Sin activar no se compila: la compilación lee el nombre y el icono de la app activa.
  assert.deepEqual(pasoDe(app({ estado: 'EN_PREPARACION', activa: false }), { build: 'ninguna' }), { tipo: 'nada' });
});

test('lo que haga Apple con la versión mueve el estado (pero enviarla a revisión es cosa del equipo)', () => {
  const pruebas = app({ estado: 'EN_PRUEBAS', activa: true });
  assert.deepEqual(pasoDe(pruebas, { fase: 'preparando' }), { tipo: 'nada' });
  assert.deepEqual(pasoDe(pruebas, { fase: 'en-revision' }), { tipo: 'cambiar', estado: 'EN_REVISION', evento: 'en-revision' });
  const revision = app({ estado: 'EN_REVISION', activa: true });
  assert.deepEqual(pasoDe(revision, { fase: 'rechazada' }), { tipo: 'cambiar', estado: 'EN_PRUEBAS', evento: 'rechazada' });
  assert.deepEqual(pasoDe(revision, { fase: 'publicada' }), {
    tipo: 'cambiar', estado: 'PUBLICADA', urlTienda: urlDeFicha('6823157562'), evento: 'publicada',
  });
  // Ya publicada: nada que hacer, ni con una versión nueva en revisión.
  assert.deepEqual(pasoDe(app({ estado: 'PUBLICADA', activa: true, urlTienda: 'https://apps.apple.com/es/app/x/id1' }), { fase: 'en-revision' }), { tipo: 'nada' });
});

test('el enlace de la ficha pasa la validación del servidor', async () => {
  const { urlTiendaValida } = await import('../app-nativa/pedir-app.ts');
  assert.equal(urlTiendaValida(urlDeFicha('6823157562')), true);
});

test('estados de Apple', () => {
  assert.equal(estadoDeBuild('VALID'), 'valida');
  assert.equal(estadoDeBuild('PROCESSING'), 'procesando');
  assert.equal(estadoDeBuild('INVALID'), 'fallida');
  assert.equal(estadoDeBuild(null), 'ninguna');
  assert.equal(faseDeVersion('READY_FOR_DISTRIBUTION'), 'publicada');
  assert.equal(faseDeVersion('READY_FOR_SALE'), 'publicada');
  assert.equal(faseDeVersion('WAITING_FOR_REVIEW'), 'en-revision');
  assert.equal(faseDeVersion('REJECTED'), 'rechazada');
  assert.equal(faseDeVersion('PREPARE_FOR_SUBMISSION'), 'preparando');
  assert.equal(faseDeVersion('WAITING_FOR_EXPORT_COMPLIANCE'), 'preparando');
  assert.equal(faseDeVersion('ALGO_NUEVO'), 'desconocida');
});

test('firmar con la clave solo con las tres variables', () => {
  assert.deepEqual(argumentosDeClave({}), []);
  assert.deepEqual(argumentosDeClave({ ASC_KEY_PATH: '/tmp/k.p8', ASC_KEY_ID: 'ABC', ASC_ISSUER_ID: '' }), []);
  assert.deepEqual(
    argumentosDeClave({ ASC_KEY_PATH: '/tmp/k.p8', ASC_KEY_ID: 'ABC', ASC_ISSUER_ID: 'iss' }),
    ['-authenticationKeyPath', '/tmp/k.p8', '-authenticationKeyID', 'ABC', '-authenticationKeyIssuerID', 'iss'],
  );
});

test('solo se revocan los certificados que ha creado esta compilación', () => {
  assert.deepEqual(certificadosNuevos(['a', 'b'], ['a', 'b', 'c']), ['c']);
  assert.deepEqual(certificadosNuevos(['a', 'b'], ['a']), []);
  assert.deepEqual(certificadosNuevos([], []), []);
});
