import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_EVENTO } from './catalogo.ts';
import { COLUMNAS_WEBHOOK_PANEL, textoMotivoDesactivado, validarCambiosWebhook, validarNuevoWebhook, webhookPanel } from './gestion-reglas.ts';

const todos = [...TIPOS_EVENTO];

test('un webhook nuevo: URL segura, al menos un aviso y solo los que su cuenta puede activar', () => {
  const ok = validarNuevoWebhook({ url: 'https://conta.example.com/h', tipos: ['recibo.creado', 'recibo.creado'], descripcion: ' Holded ' }, todos);
  assert.deepEqual(ok, { ok: true, valor: { url: 'https://conta.example.com/h', tipos: ['recibo.creado'], descripcion: 'Holded' } });
  assert.equal(validarNuevoWebhook({ url: 'http://conta.example.com/h', tipos: ['recibo.creado'] }, todos).ok, false);
  assert.equal(validarNuevoWebhook({ url: 'https://conta.example.com/h', tipos: [] }, todos).ok, false);
  assert.equal(validarNuevoWebhook({ url: 'https://conta.example.com/h', tipos: ['recibo.borrado'] }, todos).ok, false);
  assert.equal(validarNuevoWebhook({ url: 'https://conta.example.com/h', tipos: ['recibo.creado'] }, ['clienta.creada']).ok, false);
  assert.equal(validarNuevoWebhook({ url: 'https://conta.example.com/h', tipos: ['recibo.creado'], descripcion: 'x'.repeat(121) }, todos).ok, false);
  assert.equal(validarNuevoWebhook(null, todos).ok, false);
});

test('cambios: solo lo que llega, y validado igual', () => {
  assert.deepEqual(validarCambiosWebhook({ activo: false }, todos), { ok: true, valor: { activo: false } });
  assert.equal(validarCambiosWebhook({}, todos).ok, false);
  assert.equal(validarCambiosWebhook({ url: 'https://10.0.0.1/h' }, todos).ok, false);
  assert.equal(validarCambiosWebhook({ activo: 'sí' }, todos).ok, false);
  assert.deepEqual(validarCambiosWebhook({ retirarSecretoAnterior: true }, todos), { ok: true, valor: { retirarSecretoAnterior: true } });
  assert.equal(validarCambiosWebhook({ retirarSecretoAnterior: false }, todos).ok, false);
});

test('el panel nunca recibe el secreto', () => {
  assert.doesNotMatch(COLUMNAS_WEBHOOK_PANEL, /secreto_cifrado|secreto_anterior_cifrado/);
  const p = webhookPanel({
    id: 'w', url: 'https://x.example.com', descripcion: null, tipos: ['recibo.creado'], creado_en: 'x', desactivado_en: null,
    desactivado_motivo: null, fallando_desde: '2026-10-01T00:00:00Z', ultimo_exito_en: null, ultimo_intento_en: null,
    ultimo_estado_http: 500, ultimo_error: 'Respondió 500.', secreto_anterior_expira_en: '2000-01-01T00:00:00Z',
  }, new Date('2026-10-01T10:00:00Z'));
  assert.equal(p.estado, 'fallando');
  assert.equal(p.secretoAnteriorHasta, null);
  assert.ok(!JSON.stringify(p).includes('secreto_'));
});

test('el motivo de una desactivación se explica', () => {
  assert.match(textoMotivoDesactivado('fallos'), /3 días/);
  assert.match(textoMotivoDesactivado('destino_retirado'), /410/);
});
