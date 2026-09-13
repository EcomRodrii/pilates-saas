import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoConsentimientoSalud, respuestaCambioConsentimiento, normalizarFirma, FIRMA_MAX,
} from './consentimiento.ts';
import { textoConsentimientoSaludPanel } from '../legal-textos.ts';

test('estado: vigente con fecha y sin revocar; revocado manda aunque haya fecha', () => {
  assert.equal(estadoConsentimientoSalud({ fecha: '2026-09-01T10:00:00Z', revocadoEn: null }), 'VIGENTE');
  assert.equal(estadoConsentimientoSalud({ fecha: '2026-09-01T10:00:00Z', revocadoEn: '2026-09-10T10:00:00Z' }), 'REVOCADO');
  assert.equal(estadoConsentimientoSalud({ fecha: null, revocadoEn: null }), 'NO_CONSTA');
  assert.equal(estadoConsentimientoSalud({}), 'NO_CONSTA');
});

test('revocar no borra la prueba: una revocación con fecha sigue siendo REVOCADO, no NO_CONSTA', () => {
  // Es la diferencia entre sellar `revocado_en` y poner `fecha = NULL`, que es
  // lo que hacía el panel antes si se le pasaba `consentimientoSalud: undefined`.
  assert.notEqual(estadoConsentimientoSalud({ fecha: '2026-09-01', revocadoEn: '2026-09-02' }), 'NO_CONSTA');
});

test('respuesta de la RPC: OK cambia; repetir es idempotente; socia ajena 404; lo desconocido 500', () => {
  assert.deepEqual(respuestaCambioConsentimiento('OK'), { status: 200, ok: true, cambiado: true });
  assert.deepEqual(respuestaCambioConsentimiento('YA_CONSTABA'), { status: 200, ok: true, cambiado: false });
  assert.deepEqual(respuestaCambioConsentimiento('NO_CONSTABA'), { status: 200, ok: true, cambiado: false });
  assert.equal(respuestaCambioConsentimiento('SOCIA_NO_ENCONTRADA').status, 404);
  assert.equal(respuestaCambioConsentimiento(null).status, 500);
  assert.equal(respuestaCambioConsentimiento('otra cosa').ok, false);
});

test('firma: se recorta y se exige algo con letras de longitud razonable', () => {
  assert.equal(normalizarFirma('  Ana   López  '), 'Ana López');
  assert.equal(normalizarFirma(''), null);
  assert.equal(normalizarFirma(' a '), null);
  assert.equal(normalizarFirma('1234'), null);
  assert.equal(normalizarFirma(42), null);
  assert.equal(normalizarFirma('x'.repeat(FIRMA_MAX + 1)), null);
  assert.equal(normalizarFirma('Zoë'), 'Zoë');
});

test('texto del panel: lleva el nombre del estudio, explica revocar y bloquear, y no promete «nadie más»', () => {
  const t = textoConsentimientoSaludPanel({ nombre: 'Estudio Norte' });
  assert.match(t, /Estudio Norte/);
  assert.match(t, /retirar/i);
  assert.match(t, /dejarán de estar visibles/);
  assert.match(t, /eliminen/);
  assert.match(t, /instructoras que me den clase/);
  assert.doesNotMatch(t, /nadie m[aá]s/i);
});

test('texto del panel: determinista y sin nombre cae a «el Estudio»', () => {
  assert.equal(textoConsentimientoSaludPanel({ nombre: 'X' }), textoConsentimientoSaludPanel({ nombre: ' X ' }));
  assert.match(textoConsentimientoSaludPanel({}), /el Estudio/);
  // Solo depende del nombre: datos fiscales distintos no cambian la prueba.
  assert.equal(
    textoConsentimientoSaludPanel({ nombre: 'X', nif: 'B1' }),
    textoConsentimientoSaludPanel({ nombre: 'X', nif: 'B2' }),
  );
});
