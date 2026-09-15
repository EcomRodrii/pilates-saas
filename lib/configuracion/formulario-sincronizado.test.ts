import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camposEditados, hayCambios, sincronizarFormulario } from './formulario-sincronizado.ts';

type Form = { nif: string; razonSocial: string; iva: string };

const base: Form = { nif: '', razonSocial: '', iva: '21' };

test('sin tocar nada, no hay cambios y el servidor manda en todo', () => {
  assert.equal(hayCambios(base, base), false);
  const servidor: Form = { nif: 'X', razonSocial: 'Y', iva: '10' };
  assert.deepEqual(sincronizarFormulario(base, base, servidor), servidor);
});

test('lo tecleado sobrevive a un guardado de OTRO campo', () => {
  // La propietaria escribe el NIF; entretanto se guarda el IVA en otro sitio.
  const form: Form = { ...base, nif: '12345678Z' };
  const servidor: Form = { ...base, iva: '10' };
  const r = sincronizarFormulario(form, base, servidor);
  assert.deepEqual(r, { nif: '12345678Z', razonSocial: '', iva: '10' });
  // Y frente a la nueva base sigue pendiente de guardar solo el NIF.
  assert.deepEqual(camposEditados(r, servidor), ['nif']);
});

test('si el servidor cambia un campo que la propietaria SÍ tocó, gana lo tecleado', () => {
  const form: Form = { ...base, razonSocial: 'Lo mío' };
  const servidor: Form = { ...base, razonSocial: 'Lo de otra pestaña' };
  assert.equal(sincronizarFormulario(form, base, servidor).razonSocial, 'Lo mío');
});

test('tras confirmar un guardado, lo normalizado entra y la barra se va', () => {
  // Se envió con espacios; el guardado lo recorta.
  const enviado: Form = { ...base, razonSocial: '  Estudio SL ' };
  const guardado: Form = { ...base, razonSocial: 'Estudio SL' };
  const r = sincronizarFormulario(enviado, enviado, guardado);
  assert.deepEqual(r, guardado);
  assert.equal(hayCambios(r, guardado), false);
});

test('lo tecleado MIENTRAS se guardaba no se pisa al confirmar', () => {
  const enviado: Form = { ...base, nif: '12345678Z' };
  const guardado: Form = { ...enviado };
  const pantalla: Form = { ...enviado, razonSocial: 'escrito durante el guardado' };
  const r = sincronizarFormulario(pantalla, enviado, guardado);
  assert.equal(r.razonSocial, 'escrito durante el guardado');
  assert.deepEqual(camposEditados(r, guardado), ['razonSocial']);
});

test('compara por valor: booleanos, números y null', () => {
  type F = { activos: boolean; plazo: number | null };
  const b: F = { activos: false, plazo: null };
  assert.equal(hayCambios({ activos: false, plazo: null }, b), false);
  assert.deepEqual(camposEditados({ activos: true, plazo: 0 }, b), ['activos', 'plazo']);
});
