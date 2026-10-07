import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTelefono, formatearNacional, mostrarE164, enmascarar, soloCifras } from './telefono.ts';
import { decidirLlamada, AYUDA_LLAMADA, AYUDA_YO, AYUDA_POR_MI, OPCIONES_AYUDA, AYUDAS_QUE_AVISAN } from './solicitud.ts';

test('un móvil español, escrito como cada cual lo escribe, sale igual', () => {
  for (const n of ['612345678', '612 34 56 78', '612-345-678', '(612) 345 678']) {
    const r = normalizarTelefono('34', n);
    assert.deepEqual(r, { ok: true, e164: '+34612345678', nacional: '612345678' });
  }
});

test('quien pega el número con el prefijo no tiene que quitarlo', () => {
  assert.equal(normalizarTelefono('34', '+34 612 34 56 78').ok, true);
  assert.equal(normalizarTelefono('34', '0034612345678').ok, true);
});

test('un prefijo pegado que no es el del país elegido se rechaza, no se adivina', () => {
  const r = normalizarTelefono('34', '+351 912 345 678');
  assert.equal(r.ok, false);
});

test('España: 9 cifras y empieza por 6-9', () => {
  assert.equal(normalizarTelefono('34', '512345678').ok, false);
  assert.equal(normalizarTelefono('34', '61234567').ok, false);
  assert.equal(normalizarTelefono('34', '6123456789').ok, false);
  assert.equal(normalizarTelefono('34', '').ok, false);
  assert.equal(normalizarTelefono('34', 'abc').ok, false);
});

test('otro país: rango de cifras, y un prefijo desconocido no pasa', () => {
  assert.equal(normalizarTelefono('52', '5512345678').ok, true);
  assert.equal(normalizarTelefono('52', '551234').ok, false);
  assert.equal(normalizarTelefono('999', '612345678').ok, false);
  assert.equal(normalizarTelefono('', '612345678').ok, false);
});

test('formato mientras se escribe y para enseñarlo', () => {
  assert.equal(formatearNacional('34', '612345678'), '612 34 56 78');
  assert.equal(formatearNacional('34', '6123'), '612 3');
  assert.equal(mostrarE164('+34612345678'), '+34 612 34 56 78');
  assert.equal(soloCifras('+34 6-12'), '34612');
});

test('la máscara no enseña el número entero', () => {
  const m = enmascarar('+34612345678');
  assert.ok(!m.includes('612345'));
});

test('la opción de llamada es la única que guarda teléfono', () => {
  assert.deepEqual([...OPCIONES_AYUDA], [AYUDA_YO, AYUDA_LLAMADA, AYUDA_POR_MI]);
  for (const ayuda of [AYUDA_YO, AYUDA_POR_MI, undefined]) {
    assert.deepEqual(
      decidirLlamada({ ayuda, prefijo: '34', telefono: '612345678', consentimiento: true }),
      { tipo: 'no-aplica' },
    );
  }
});

test('sin consentimiento no se guarda nada, aunque el número sea válido', () => {
  const d = decidirLlamada({ ayuda: AYUDA_LLAMADA, prefijo: '34', telefono: '612345678', consentimiento: false });
  assert.equal(d.tipo, 'invalida');
  assert.equal(decidirLlamada({ ayuda: AYUDA_LLAMADA, prefijo: '34', telefono: '612345678' }).tipo, 'invalida');
  // Ni un «true» disfrazado.
  assert.equal(decidirLlamada({ ayuda: AYUDA_LLAMADA, prefijo: '34', telefono: '612345678', consentimiento: 'true' }).tipo, 'invalida');
});

test('con consentimiento y número válido se guarda E.164 y la hora si es de la lista', () => {
  assert.deepEqual(
    decidirLlamada({ ayuda: AYUDA_LLAMADA, prefijo: '34', telefono: '612 34 56 78', consentimiento: true, horaPreferida: 'tarde' }),
    { tipo: 'guardar', e164: '+34612345678', horaPreferida: 'tarde' },
  );
  const d = decidirLlamada({ ayuda: AYUDA_LLAMADA, prefijo: '34', telefono: '612345678', consentimiento: true, horaPreferida: 'madrugada' });
  assert.deepEqual(d, { tipo: 'guardar', e164: '+34612345678', horaPreferida: null });
});

test('con teléfono inválido se pide corregirlo', () => {
  const d = decidirLlamada({ ayuda: AYUDA_LLAMADA, prefijo: '34', telefono: '123', consentimiento: true });
  assert.equal(d.tipo, 'invalida');
});

test('«Configuradlo por mí» avisa al equipo; «Lo configuro yo» no', () => {
  assert.equal(AYUDAS_QUE_AVISAN.has(AYUDA_POR_MI), true);
  assert.equal(AYUDAS_QUE_AVISAN.has(AYUDA_LLAMADA), true);
  assert.equal(AYUDAS_QUE_AVISAN.has(AYUDA_YO), false);
});
