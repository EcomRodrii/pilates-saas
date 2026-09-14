import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS_PRIVADAS_SOCIA, fusionarDatosPrivados, cambiosSociaPermitidos,
  cumpleMesDia, formatearCumple, diasHastaCumple, normalizarNifSocia, NIF_SOCIA_MAX,
} from './datos-privados.ts';

// M1 (auditoría RGPD 2026-09-13): NIF, dirección, fecha de nacimiento, firma y
// pago solo para PROPIETARIO y RECEPCION. El panel los junta desde una RPC que
// devuelve cero filas al resto, y los formularios no pueden mandarlos a ciegas.

test('son exactamente las 12 columnas privadas acordadas', () => {
  assert.deepEqual([...COLUMNAS_PRIVADAS_SOCIA].sort(), [
    'aceptacion_firma', 'direccion', 'fecha_nacimiento', 'nif',
    'sepa_mandate_id', 'sepa_payment_method_id',
    'stripe_customer_id', 'stripe_payment_method_id',
    'tarjeta_exp_anio', 'tarjeta_exp_mes', 'tarjeta_marca', 'tarjeta_ultimos4',
  ]);
});

test('fusión: con permiso, cada fila recibe sus privados por id', () => {
  const filas = [{ id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Bea' }];
  const privadas = [{ id: 'b', nif: '1B', aceptacion_firma: 'Bea O.' }, { id: 'a', nif: '1A', aceptacion_firma: null }];
  const r = fusionarDatosPrivados(filas, privadas);
  assert.deepEqual(r, [
    { id: 'a', nombre: 'Ana', nif: '1A', aceptacion_firma: null },
    { id: 'b', nombre: 'Bea', nif: '1B', aceptacion_firma: 'Bea O.' },
  ]);
});

test('fusión: sin permiso (la RPC devuelve 0 filas) las filas quedan SIN las claves privadas', () => {
  const filas = [{ id: 'a', nombre: 'Ana' }];
  const r = fusionarDatosPrivados(filas, []);
  assert.deepEqual(r, [{ id: 'a', nombre: 'Ana' }]);
  assert.equal('nif' in r[0], false);
});

test('fusión: la RPC no puede pisar columnas públicas ni colar otras', () => {
  const filas = [{ id: 'a', nombre: 'Ana', email: 'ana@x.es' }];
  const privadas = [{ id: 'a', nif: '1A', nombre: 'OTRA', email: 'otra@x.es' } as unknown as { id: string; nif: string }];
  assert.deepEqual(fusionarDatosPrivados(filas, privadas), [{ id: 'a', nombre: 'Ana', email: 'ana@x.es', nif: '1A' }]);
});

test('fusión: una socia que la RPC no trae (o que llega tarde) no se inventa', () => {
  const filas = [{ id: 'a' }, { id: 'nueva' }];
  const r = fusionarDatosPrivados(filas, [{ id: 'a', nif: 'X' }]);
  assert.deepEqual(r, [{ id: 'a', nif: 'X' }, { id: 'nueva' }]);
});

const FORM = { nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@x.es', telefono: '600', nif: null as string | null };

test('guardar: sin permiso NO se manda el NIF (con el campo oculto lo borraría)', () => {
  const r = cambiosSociaPermitidos(FORM, { puedeVerPrivados: false });
  assert.equal('nif' in r, false);
  assert.deepEqual(r, { nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@x.es', telefono: '600' });
});

test('guardar: sin permiso tampoco sale la aceptación (escribe la firma) ni ningún dato de pago', () => {
  const r = cambiosSociaPermitidos({
    nombre: 'Ana', direccion: 'C/ Mayor', fechaNacimiento: '1990-01-01', stripeCustomerId: 'cus_x',
    sepaMandateId: 'm', tarjetaUltimos4: '4242', aceptacionContrato: { fecha: 'x', firma: 'Ana', versionTexto: '' },
  }, { puedeVerPrivados: false });
  assert.deepEqual(r, { nombre: 'Ana' });
});

test('guardar: con permiso y NIF cambiado, se manda', () => {
  const r = cambiosSociaPermitidos({ ...FORM, nif: '12345678Z' }, { puedeVerPrivados: true, original: { nif: null } });
  assert.equal(r.nif, '12345678Z');
});

test('guardar: con permiso pero el NIF no llegó a cargar (RPC caída) y nadie lo tocó → no se manda', () => {
  // El formulario enseña '' → `nif: null`; la socia tiene NIF en la BD que el
  // panel no ve. Mandarlo lo borraría.
  const r = cambiosSociaPermitidos(FORM, { puedeVerPrivados: true, original: { nif: undefined } });
  assert.equal('nif' in r, false);
});

test('guardar: con permiso, vaciar un NIF que sí estaba es un cambio y se manda', () => {
  const r = cambiosSociaPermitidos(FORM, { puedeVerPrivados: true, original: { nif: '12345678Z' } });
  assert.equal(r.nif, null);
});

test('guardar: con permiso y sin original (alta), se manda tal cual', () => {
  const r = cambiosSociaPermitidos({ ...FORM, nif: 'X', aceptacionContrato: { firma: 'Ana' } }, { puedeVerPrivados: true });
  assert.equal(r.nif, 'X');
  assert.deepEqual(r.aceptacionContrato, { firma: 'Ana' });
});

test('NIF: vacío o solo espacios es borrarlo (null), y se guarda sin espacios alrededor', () => {
  assert.equal(normalizarNifSocia(null), null);
  assert.equal(normalizarNifSocia(''), null);
  assert.equal(normalizarNifSocia('   '), null);
  assert.equal(normalizarNifSocia(' 12345678Z '), '12345678Z');
});

test('NIF: un documento extranjero vale; lo que no puede ser un documento, no', () => {
  assert.equal(normalizarNifSocia('AB1234567'), 'AB1234567');
  assert.equal(normalizarNifSocia('x'.repeat(NIF_SOCIA_MAX + 1)), undefined);
  assert.equal(normalizarNifSocia('123\n45'), undefined);
  assert.equal(normalizarNifSocia(12345678), undefined);
  assert.equal(normalizarNifSocia(undefined), undefined);
});

test('cumpleaños: prefiere cumpleMmDd; en servidor lo saca de la fecha completa', () => {
  assert.equal(cumpleMesDia({ cumpleMmDd: '03-14', fechaNacimiento: null }), '03-14');
  assert.equal(cumpleMesDia({ fechaNacimiento: '1990-03-14' }), '03-14');
  assert.equal(cumpleMesDia({ cumpleMmDd: null, fechaNacimiento: null }), null);
  assert.equal(cumpleMesDia({ cumpleMmDd: 'basura' }), null);
  assert.equal(cumpleMesDia(null), null);
});

test('cumpleaños: se pinta día y mes, sin año, y el 29 de febrero existe', () => {
  assert.equal(formatearCumple('03-14'), '14 de marzo');
  assert.equal(formatearCumple('02-29'), '29 de febrero');
  assert.equal(formatearCumple(null), null);
  assert.equal(formatearCumple('13-01'), null);
});

test('días hasta el cumpleaños: hoy es 0, mañana 1, ayer da la vuelta al año', () => {
  const now = new Date(2026, 8, 14, 18, 30); // 14-sep, por la tarde
  assert.equal(diasHastaCumple('09-14', now), 0);
  assert.equal(diasHastaCumple('09-15', now), 1);
  assert.equal(diasHastaCumple('09-13', now), 364);
  assert.equal(diasHastaCumple('xx', now), null);
});
