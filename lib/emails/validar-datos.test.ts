import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarDatosEmail } from './validar-datos.ts';

const claseOk = { claseNombre: 'Reformer Iniciación', fecha: '2026-07-27', hora: '09:00' };

test('automatizacion: sin mensaje no se envía (el mensaje ES el email)', () => {
  assert.match(validarDatosEmail('automatizacion', { titulo: 'Hola' }) ?? '', /mensaje/);
  assert.match(validarDatosEmail('automatizacion', { titulo: 'Hola', mensaje: '   ' }) ?? '', /mensaje/);
  assert.match(validarDatosEmail('automatizacion', { titulo: 'Hola', mensaje: null }) ?? '', /mensaje/);
  assert.equal(validarDatosEmail('automatizacion', { titulo: 'Hola', mensaje: 'Tienes un pago pendiente.' }), null);
});

test('las cuatro de clase exigen claseNombre, fecha y hora', () => {
  for (const tipo of ['reserva', 'promocion', 'cancelacion', 'recordatorio']) {
    assert.equal(validarDatosEmail(tipo, claseOk), null, `${tipo} con datos completos`);
    // claseNombre va en el asunto y en el preview: sin él la bandeja de entrada
    // de la clienta dice "undefined ha sido cancelada".
    assert.match(validarDatosEmail(tipo, { ...claseOk, claseNombre: undefined }) ?? '', /claseNombre/, tipo);
    assert.match(validarDatosEmail(tipo, { ...claseOk, fecha: '' }) ?? '', /fecha/, tipo);
    assert.match(validarDatosEmail(tipo, { ...claseOk, hora: null }) ?? '', /hora/, tipo);
  }
});

test('sala e instructor vacíos NO bloquean: el cron los manda así a propósito', () => {
  // lib/supabase-data.ts:1848-1849 — una sesión sin sala o sin instructora
  // asignada es un caso válido; exigirlos rompería el cron de recordatorios.
  assert.equal(validarDatosEmail('recordatorio', { ...claseOk, sala: '', instructor: '' }), null);
});

test('bienvenida no exige nada: la plantilla ya es defensiva', () => {
  assert.equal(validarDatosEmail('bienvenida', {}), null);
  assert.equal(validarDatosEmail('bienvenida', { planNombre: undefined }), null);
});

test('recibo: el importe se valida por tipo, no por presencia', () => {
  const base = { concepto: 'Bono 10 clases', fechaCobro: '2026-07-25' };
  assert.equal(validarDatosEmail('recibo', { ...base, importe: 85 }), null);
  // Un recibo de 0 € es legítimo (regalo, ajuste): `!importe` lo habría tumbado.
  assert.equal(validarDatosEmail('recibo', { ...base, importe: 0 }), null);
  // Un string del JSON revienta igual que undefined en importe.toFixed(2).
  assert.match(validarDatosEmail('recibo', { ...base, importe: '85.00' }) ?? '', /número/);
  assert.match(validarDatosEmail('recibo', { ...base, importe: undefined }) ?? '', /número/);
  assert.match(validarDatosEmail('recibo', { ...base, importe: NaN }) ?? '', /número/);
});

test('recibo: la fecha tiene que parsear, no solo existir', () => {
  const base = { concepto: 'Bono 10 clases', importe: 85 };
  assert.equal(validarDatosEmail('recibo', { ...base, fechaCobro: '2026-07-25' }), null);
  // "ayer" pasa un check de presencia y renderiza "Invalid Date" en el email.
  assert.match(validarDatosEmail('recibo', { ...base, fechaCobro: 'ayer' }) ?? '', /fecha/i);
  assert.match(validarDatosEmail('recibo', { ...base, fechaCobro: null }) ?? '', /fecha/i);
});

test('recibo: sin concepto el asunto saldría "Pago confirmado — undefined"', () => {
  // No hay asuntoCustom para recibo: no es un tipo de plantilla editable.
  assert.match(validarDatosEmail('recibo', { importe: 85, fechaCobro: '2026-07-25' }) ?? '', /concepto/);
});

test('data ausente o null no revienta el validador', () => {
  assert.match(validarDatosEmail('reserva', null) ?? '', /claseNombre/);
  assert.match(validarDatosEmail('reserva', undefined) ?? '', /claseNombre/);
  assert.equal(validarDatosEmail('bienvenida', null), null);
});

test('un tipo desconocido no se bloquea aquí (lo rechaza el route con 400)', () => {
  assert.equal(validarDatosEmail('inventado', {}), null);
});

// Cambio de instructora: el email existe para decir QUIÉN da ahora la clase.
test('cambio: sin instructor no se envía (sería un aviso que no dice el cambio)', () => {
  assert.match(
    validarDatosEmail('cambio', { claseNombre: 'Reformer', fecha: 'lunes', hora: '09:00' }) ?? '',
    /instructor/,
  );
});

test('cambio: con los cuatro campos pasa', () => {
  assert.equal(
    validarDatosEmail('cambio', {
      claseNombre: 'Reformer', fecha: 'domingo, 2 de agosto', hora: '09:00', instructor: 'Laura Gil',
    }),
    null,
  );
});

test('cambio: sala no se exige (una sesión puede no tenerla asignada)', () => {
  assert.equal(
    validarDatosEmail('cambio', {
      claseNombre: 'Reformer', fecha: 'domingo', hora: '09:00', instructor: 'Laura Gil', sala: '',
    }),
    null,
  );
});
