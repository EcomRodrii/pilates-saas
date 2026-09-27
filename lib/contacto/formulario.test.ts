import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoCamposVacios, camposVacios, emailConFormato, primerNombre, viasDeContacto } from './formulario.ts';
import { validarConsulta } from './consulta.ts';

const lleno = { nombre: 'Ana', email: 'ana@example.com', mensaje: 'Hola' };

test('campos vacíos: solo los que faltan, en el orden de la pantalla, y un espacio no cuenta como escrito', () => {
  assert.deepEqual(camposVacios(lleno), []);
  assert.deepEqual(camposVacios({ ...lleno, mensaje: '   ' }), ['mensaje']);
  assert.deepEqual(camposVacios({ nombre: '', email: '', mensaje: '' }), ['nombre', 'email', 'mensaje']);
  assert.deepEqual(camposVacios({ ...lleno, nombre: ' ', mensaje: '' }), ['nombre', 'mensaje']);
});

test('el aviso dice qué falta, en singular o plural', () => {
  assert.equal(avisoCamposVacios([]), null);
  assert.equal(avisoCamposVacios(['email']), 'Falta tu email.');
  assert.equal(avisoCamposVacios(['nombre', 'mensaje']), 'Faltan tu nombre y el mensaje.');
  assert.equal(avisoCamposVacios(['nombre', 'email', 'mensaje']), 'Faltan tu nombre, tu email y el mensaje.');
});

test('⚠️ el email se comprueba con el MISMO criterio que el servidor: nada que el formulario deje pasar lo rechaza después', () => {
  const casos = ['ana@example.com', ' Ana@Example.com ', 'ana@example', 'ana.example.com', 'ana@ex ample.com', 'a@b', ''];
  for (const email of casos) {
    const servidor = validarConsulta({ slug: 'x', nombre: 'Ana', email, mensaje: 'Hola', aceptaPrivacidad: true }).ok;
    assert.equal(emailConFormato(email), servidor, email);
  }
});

test('primer nombre: sin espacios de más ni tabuladores', () => {
  assert.equal(primerNombre('  Ana   María Pérez '), 'Ana');
  assert.equal(primerNombre('Ana\tMaría'), 'Ana');
  assert.equal(primerNombre('Lucía'), 'Lucía');
  assert.equal(primerNombre('   '), '');
});

test('vías de contacto: email a mailto y teléfono a tel con solo dígitos y el + inicial', () => {
  assert.deepEqual(viasDeContacto('hola@example.com', '+34 600 00 00 00'), [
    { texto: 'hola@example.com', href: 'mailto:hola@example.com' },
    { texto: '+34 600 00 00 00', href: 'tel:+34600000000' },
  ]);
  assert.deepEqual(viasDeContacto(null, '(952) 123-456'), [{ texto: '(952) 123-456', href: 'tel:952123456' }]);
});

test('vías de contacto: lo vacío o sin dígitos no se ofrece', () => {
  assert.deepEqual(viasDeContacto(null, null), []);
  assert.deepEqual(viasDeContacto('  ', ''), []);
  assert.deepEqual(viasDeContacto(' hola@example.com ', 'llámanos'), [{ texto: 'hola@example.com', href: 'mailto:hola@example.com' }]);
});
