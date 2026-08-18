import test from 'node:test';
import assert from 'node:assert/strict';
import { validarMisDatos, hayErrores, hayCambios, type MisDatos } from './mis-datos.ts';

const AHORA = new Date('2026-08-18T10:00:00Z');

function datos(parcial: Partial<MisDatos> = {}): MisDatos {
  return {
    nombre: 'Marta', apellidos: 'Ruiz', email: 'marta@example.com',
    telefono: '', fechaNacimiento: '', direccion: '',
    ...parcial,
  };
}

test('unos datos normales no dan ningún error', () => {
  assert.equal(hayErrores(validarMisDatos(datos(), AHORA)), false);
});

test('el nombre y el email son lo único obligatorio', () => {
  const e = validarMisDatos(datos({ nombre: '  ', email: '' }), AHORA);
  assert.ok(e.nombre);
  assert.ok(e.email);
  // Los demás pueden quedarse vacíos: hay socias que no dan teléfono ni dirección.
  assert.equal(e.telefono, undefined);
  assert.equal(e.direccion, undefined);
  assert.equal(e.apellidos, undefined);
});

test('caza el email a medias, que es el teclazo de verdad', () => {
  assert.ok(validarMisDatos(datos({ email: 'marta@gmail' }), AHORA).email);
  assert.ok(validarMisDatos(datos({ email: 'marta gmail.com' }), AHORA).email);
});

// ⚠️ El criterio es dejar pasar. Una regla más estricta rechazaría direcciones
// válidas de verdad, y quien manda es el servidor de correo, no esta pantalla.
test('deja pasar emails raros pero legítimos', () => {
  for (const email of ['marta+pilates@example.co.uk', "o'brien@example.com", 'maría@example.com']) {
    assert.equal(validarMisDatos(datos({ email }), AHORA).email, undefined, email);
  }
});

test('el teléfono vacío vale; el incompleto no', () => {
  assert.equal(validarMisDatos(datos({ telefono: '' }), AHORA).telefono, undefined);
  assert.ok(validarMisDatos(datos({ telefono: '600 11' }), AHORA).telefono);
});

// ⚠️ Nada de formato español obligatorio: hay socias con número de fuera, y
// forzar `+34` las dejaría sin poder guardar su propio teléfono.
test('acepta el teléfono escrito como a cada una le salga', () => {
  for (const telefono of ['600112233', '+34 600 11 22 33', '(+34) 600-11-22-33', '+44 7700 900123']) {
    assert.equal(validarMisDatos(datos({ telefono }), AHORA).telefono, undefined, telefono);
  }
});

test('una fecha de nacimiento futura es un teclazo en el año', () => {
  assert.ok(validarMisDatos(datos({ fechaNacimiento: '2030-01-01' }), AHORA).fechaNacimiento);
  assert.equal(validarMisDatos(datos({ fechaNacimiento: '1988-03-14' }), AHORA).fechaNacimiento, undefined);
});

test('una fecha imposible se rechaza sin romper nada', () => {
  // `new Date('2026-02-31')` no lanza: da una fecha inválida. Si esto no se
  // comprobara, el `NaN` viajaría al servidor.
  assert.ok(validarMisDatos(datos({ fechaNacimiento: 'no-es-fecha' }), AHORA).fechaNacimiento);
});

test('hayCambios ignora los espacios de más', () => {
  const guardado = datos();
  assert.equal(hayCambios(datos({ nombre: ' Marta ' }), guardado), false);
  assert.equal(hayCambios(datos({ nombre: 'Marta Elena' }), guardado), true);
});
