import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoCamposVacios, camposVacios, emailConFormato, pendienteEnPaso, primerNombre, primerPendiente, viasDeContacto,
  EMAIL_CON_ERRATA, PRIVACIDAD_SIN_MARCAR,
} from './formulario.ts';
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

const todo = { ...lleno, privacidad: true };

test('al enviar se para en lo primero que falla: vacíos, luego el email, luego la privacidad', () => {
  assert.equal(primerPendiente(todo), null);
  assert.deepEqual(primerPendiente({ nombre: '', email: '', mensaje: '', privacidad: false }), {
    paso: 'vacios', mensaje: 'Faltan tu nombre, tu email y el mensaje.', campos: ['nombre', 'email', 'mensaje'],
  });
  assert.deepEqual(primerPendiente({ ...todo, email: 'ana@example', privacidad: false }), {
    paso: 'email', mensaje: EMAIL_CON_ERRATA, campos: ['email'],
  });
  assert.deepEqual(primerPendiente({ ...todo, privacidad: false }), {
    paso: 'privacidad', mensaje: PRIVACIDAD_SIN_MARCAR, campos: ['privacidad'],
  });
});

test('⚠️ el aviso y las marcas dicen lo mismo: nada en rojo que el aviso no nombre', () => {
  // Todo vacío y sin casilla: el aviso habla de los tres campos, la casilla no se marca.
  const p = pendienteEnPaso('vacios', { nombre: '', email: '', mensaje: '', privacidad: false });
  assert.deepEqual(p?.campos, ['nombre', 'email', 'mensaje']);
  // Solo falta el mensaje y el email lleva errata: se marca el mensaje, no el email.
  assert.deepEqual(pendienteEnPaso('vacios', { ...todo, email: 'ana@example', mensaje: '' })?.campos, ['mensaje']);
});

test('al corregir, el aviso se actualiza y desaparece; no salta solo al paso siguiente', () => {
  const vacio = { nombre: '', email: '', mensaje: '', privacidad: false };
  assert.equal(pendienteEnPaso('vacios', { ...vacio, nombre: 'Ana' })?.mensaje, 'Faltan tu email y el mensaje.');
  // Todo escrito (con errata en el email y sin casilla): el paso de los vacíos ya no tiene nada que decir.
  assert.equal(pendienteEnPaso('vacios', { nombre: 'Ana', email: 'ana@', mensaje: 'Hola', privacidad: false }), null);
  assert.equal(pendienteEnPaso('email', { ...todo, email: 'ana@example.com' }), null);
  assert.equal(pendienteEnPaso('privacidad', todo), null);
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
