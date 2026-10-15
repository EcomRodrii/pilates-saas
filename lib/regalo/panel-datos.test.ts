import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AJUSTES_POR_DEFECTO } from './reglas.ts';
import { leerDatosPanelRegalo } from './panel-datos.ts';

const TARJETA = {
  id: 'reg-1', importe_inicial: 50, origen: 'MANUAL', comprador_nombre: 'Compradora', comprador_email: 'compra@example.com',
  destinatario_nombre: null, destinatario_email: null, mensaje: null, caduca_en: '2027-10-15', estado: 'ACTIVA',
  anulada_motivo: null, socio_id: null, correo_enviado_en: null, creada_en: '2026-10-15T10:00:00Z', saldo: 50, estado_efectivo: 'ACTIVA',
};
const BUENA = { ajustes: AJUSTES_POR_DEFECTO, tarjetas: [TARJETA], pasivoVivo: 50, puedeEditarAjustes: true };

test('la respuesta del servidor, tal cual, se lee entera', () => {
  assert.deepEqual(leerDatosPanelRegalo(BUENA), BUENA);
  assert.deepEqual(leerDatosPanelRegalo({ ...BUENA, tarjetas: [] })?.tarjetas, []);
});

test('lo que tumbaba la pestaña (un `{}`, nada, una lista o texto) es `null`, no una pantalla rota', () => {
  for (const raro of [{}, null, undefined, [], 'error', 0, { error: 'boom' }]) assert.equal(leerDatosPanelRegalo(raro), null, JSON.stringify(raro));
});

test('a medias tampoco vale: sin tarjetas, sin ajustes o con una tarjeta sin saldo', () => {
  const { tarjetas: _t, ...sinTarjetas } = BUENA;
  assert.equal(leerDatosPanelRegalo(sinTarjetas), null);
  assert.equal(leerDatosPanelRegalo({ ...BUENA, tarjetas: null }), null);
  assert.equal(leerDatosPanelRegalo({ ...BUENA, ajustes: {} }), null);
  assert.equal(leerDatosPanelRegalo({ ...BUENA, ajustes: { ...AJUSTES_POR_DEFECTO, importesEur: null } }), null);
  assert.equal(leerDatosPanelRegalo({ ...BUENA, tarjetas: [{ ...TARJETA, saldo: '50' }] }), null);
  assert.equal(leerDatosPanelRegalo({ ...BUENA, tarjetas: [{ ...TARJETA, id: undefined }] }), null);
  assert.equal(leerDatosPanelRegalo({ ...BUENA, pasivoVivo: null }), null);
  assert.equal(leerDatosPanelRegalo({ ...BUENA, puedeEditarAjustes: 'si' }), null);
});
