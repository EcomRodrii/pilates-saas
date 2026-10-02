import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeDeudaWhatsApp } from './mensaje-deuda.ts';
import { formatEuro } from '../utils.ts';

test('un recibo: el nombre de pila, el estudio, el importe y el concepto entero', () => {
  const m = mensajeDeudaWhatsApp({ nombre: 'Julia Moreno García', estudio: 'Pilates Centro', recibos: [{ concepto: 'Mensual 2 días/semana — septiembre', importe: 65 }] });
  assert.equal(m, `Hola Julia, te escribo de Pilates Centro: tienes pendiente ${formatEuro(65)} (Mensual 2 días/semana — septiembre). ¿Te viene bien pasarte por recepción para pagarlo?`);
});

test('dos recibos se nombran; más, se cuentan; el total es la suma', () => {
  const dos = mensajeDeudaWhatsApp({ nombre: 'Laura', estudio: 'E', recibos: [{ concepto: 'Agosto', importe: 89 }, { concepto: 'Septiembre', importe: 89 }] });
  assert.match(dos, /\(Agosto y Septiembre\)/);
  assert.ok(dos.includes(formatEuro(178)));
  const tres = mensajeDeudaWhatsApp({ nombre: 'Laura', estudio: 'E', recibos: [{ concepto: 'a', importe: 1 }, { concepto: 'b', importe: 2 }, { concepto: 'c', importe: 3 }] });
  assert.match(tres, /\(3 recibos\)/);
});

test('nunca promete un enlace para pagar (no existe)', () => {
  const m = mensajeDeudaWhatsApp({ nombre: 'Ana', estudio: 'E', recibos: [{ concepto: 'x', importe: 10 }] });
  assert.doesNotMatch(m, /enlace/i);
});
