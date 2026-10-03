import test from 'node:test';
import assert from 'node:assert/strict';
import {
  caducidadCodigo, codigoDesdeEntero, esperaParaReenviar, formatoCodigoValido, motivoAntesDeLaBd, motivoDeLaBd,
  textoSinCorreo, MINUTOS_CODIGO_CORREO, SEGUNDOS_ENTRE_ENVIOS, type MotivoSinCorreo,
} from './codigo-correo-reglas.ts';

const ahora = new Date('2026-10-03T10:00:00Z');
const base = {
  nivel: 'aal1' as const, factoresVerificados: 1, sesion: '3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b', email: 'equipo@example.com',
};

test('el código dura 10 minutos', () => {
  assert.equal(MINUTOS_CODIGO_CORREO, 10);
  assert.equal(caducidadCodigo(ahora).toISOString(), '2026-10-03T10:10:00.000Z');
});

test('formato: seis dígitos y nada más', () => {
  assert.equal(formatoCodigoValido('012345'), true);
  assert.equal(formatoCodigoValido('12345'), false);
  assert.equal(formatoCodigoValido('1234567'), false);
  assert.equal(formatoCodigoValido('12345a'), false);
  assert.equal(formatoCodigoValido(' 123456'), false);
  assert.equal(formatoCodigoValido(123456), false);
});

test('el código conserva los ceros a la izquierda y no sale del rango', () => {
  assert.equal(codigoDesdeEntero(7), '000007');
  assert.equal(codigoDesdeEntero(999_999), '999999');
  assert.throws(() => codigoDesdeEntero(1_000_000));
  assert.throws(() => codigoDesdeEntero(-1));
  assert.throws(() => codigoDesdeEntero(1.5));
});

test('antes de la BD: con la verificación activada, sesión y correo, se pregunta', () => {
  assert.equal(motivoAntesDeLaBd(base), null);
  assert.equal(motivoAntesDeLaBd({ ...base, factoresVerificados: 0 }), 'sin_verificacion');
  assert.equal(motivoAntesDeLaBd({ ...base, nivel: 'aal2' }), 'ya_verificada');
  assert.equal(motivoAntesDeLaBd({ ...base, sesion: null }), 'sin_sesion');
  assert.equal(motivoAntesDeLaBd({ ...base, email: null }), 'sin_correo');
  assert.equal(motivoAntesDeLaBd({ ...base, email: '' }), 'sin_correo');
});

test('la respuesta de la BD falla cerrado: solo null es un sí', () => {
  assert.equal(motivoDeLaBd(null, null), null);
  assert.equal(motivoDeLaBd('sin_contrasena', null), 'sin_contrasena');
  assert.equal(motivoDeLaBd('bloqueado', null), 'bloqueado');
  assert.equal(motivoDeLaBd(undefined, null), 'sin_sesion', 'sin respuesta no es un sí');
  assert.equal(motivoDeLaBd('otra-cosa', null), 'sin_sesion');
  assert.equal(motivoDeLaBd(null, { message: 'caída' }), 'sin_envio', 'un error no es un sí');
});

test('todo motivo tiene su texto, y los que no son «ya está» mandan a la app', () => {
  const motivos: MotivoSinCorreo[] = ['sin_verificacion', 'ya_verificada', 'sin_sesion', 'sin_contrasena', 'bloqueado', 'sin_correo', 'buzon_rebota', 'sin_envio'];
  for (const m of motivos) {
    const t = textoSinCorreo(m);
    assert.ok(t.length > 10, m);
    if (m !== 'ya_verificada') assert.match(t, /app de autenticación/, m);
  }
});

test('el motivo de la BD coincide con los que devuelve la migración', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../../supabase/migrations/20261003160000_doble_factor_por_correo.sql', import.meta.url), 'utf8');
  const cuerpo = sql.slice(sql.indexOf('function public.correo_doble_factor_disponible'), sql.indexOf('comment on function public.correo_doble_factor_disponible'));
  const devueltos = [...cuerpo.matchAll(/then '([a-z_]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(devueltos, ['bloqueado', 'sin_contrasena', 'sin_sesion', 'sin_verificacion']);
  for (const d of devueltos) assert.equal(motivoDeLaBd(d, null), d, `la BD devuelve «${d}» y aquí no se conoce`);
});

test('reenviar: hay que esperar 30 segundos desde el último envío', () => {
  assert.equal(SEGUNDOS_ENTRE_ENVIOS, 30);
  assert.equal(esperaParaReenviar(null, ahora), 0);
  assert.equal(esperaParaReenviar('2026-10-03T09:59:50Z', ahora), 20);
  assert.equal(esperaParaReenviar('2026-10-03T09:59:30Z', ahora), 0);
  assert.equal(esperaParaReenviar('2026-10-03T09:59:29.500Z', ahora), 0);
  assert.equal(esperaParaReenviar('2026-10-03T09:59:59.500Z', ahora), 30);
});
