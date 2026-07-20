import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarMensajePersonalizado, numerosPermitidosMensaje } from './personalizacion.ts';
import type { MensajeSocia } from './mensajes-socia.ts';

const base: MensajeSocia = {
  asunto: 'Te echamos de menos, Marta',
  cuerpo: '¡Hola Marta! Hace unas semanas que no te vemos por Pilates Boutique. Te guardamos un 15% de descuento. ¿Te reservo sitio?',
};
const datos = { nombre: 'Marta', diasSinVenir: 21, descuentoPct: 15 };
const permitidos = numerosPermitidosMensaje(base, datos);

function json(asunto: string, cuerpo: string) {
  return JSON.stringify({ asunto, cuerpo });
}

test('acepta una reescritura válida sin cifras nuevas', () => {
  const r = validarMensajePersonalizado(
    json('¿Volvemos, Marta?', 'Hola Marta, te echo de menos en clase. Tienes un 15% en tu próxima renovación. ¿Te guardo sitio?'),
    base, permitidos,
  );
  assert.equal(r.asunto, '¿Volvemos, Marta?');
  assert.ok(r.cuerpo.includes('15%'));
});

test('RECHAZA un descuento inventado (cifra fuera de datosUsados)', () => {
  const r = validarMensajePersonalizado(
    json('¿Volvemos, Marta?', 'Hola Marta, te hago un 50% de descuento si vuelves esta semana.'),
    base, permitidos,
  );
  assert.deepEqual(r, base); // cae al determinista
});

test('RECHAZA fechas/importes inventados en el asunto', () => {
  const r = validarMensajePersonalizado(json('Marta, oferta hasta el 30', 'Hola Marta, ¿te reservo sitio?'), base, permitidos);
  assert.deepEqual(r, base);
});

test('JSON inválido → determinista', () => {
  assert.deepEqual(validarMensajePersonalizado('esto no es json', base, permitidos), base);
});

test('tipos incorrectos → determinista', () => {
  assert.deepEqual(validarMensajePersonalizado(JSON.stringify({ asunto: 5, cuerpo: 'x' }), base, permitidos), base);
  assert.deepEqual(validarMensajePersonalizado(JSON.stringify({ cuerpo: 'solo cuerpo' }), base, permitidos), base);
});

test('vacíos o demasiado largos → determinista', () => {
  assert.deepEqual(validarMensajePersonalizado(json('', 'x'), base, permitidos), base);
  assert.deepEqual(validarMensajePersonalizado(json('a'.repeat(91), 'x'), base, permitidos), base);
  assert.deepEqual(validarMensajePersonalizado(json('ok', 'c'.repeat(501)), base, permitidos), base);
});

test('numerosPermitidosMensaje incluye datosUsados y el texto base', () => {
  const p = numerosPermitidosMensaje(base, datos);
  assert.ok(p.has('15'));  // descuentoPct + texto base
  assert.ok(p.has('21'));  // diasSinVenir, aunque no esté en el texto
  assert.ok(!p.has('50'));
});

test('sin datos, solo valen las cifras del mensaje base', () => {
  const soloBase: MensajeSocia = { asunto: 'Hola', cuerpo: 'Quedan 3 sesiones de tu bono.' };
  const p = numerosPermitidosMensaje(soloBase, undefined);
  assert.ok(p.has('3'));
  const r = validarMensajePersonalizado(json('Hola', 'Quedan 9 sesiones.'), soloBase, p);
  assert.deepEqual(r, soloBase);
});

// El código de descuento debe sobrevivir intacto: si la IA lo altera o lo pierde,
// la socia recibiría una oferta incanjeable.
const conCodigo: MensajeSocia = {
  asunto: 'Te echamos de menos, Marta',
  cuerpo: '¡Hola Marta! Te guardamos un 15% de descuento: usa el código VUELVE-A3F2 cuando vengas.',
};
const permitidosCodigo = numerosPermitidosMensaje(conCodigo, { nombre: 'Marta', descuentoPct: 15 });

test('conserva el mensaje reescrito si el código aparece intacto', () => {
  const r = validarMensajePersonalizado(
    json('¿Volvemos, Marta?', 'Hola Marta, te guardo un 15% con el código VUELVE-A3F2. ¿Te reservo sitio?'),
    conCodigo, permitidosCodigo, ['VUELVE-A3F2'],
  );
  assert.match(r.cuerpo, /VUELVE-A3F2/);
  assert.equal(r.asunto, '¿Volvemos, Marta?');
});

test('RECHAZA la reescritura si la IA pierde el código', () => {
  const r = validarMensajePersonalizado(
    json('¿Volvemos, Marta?', 'Hola Marta, te guardo un 15% de descuento. ¿Te reservo sitio?'),
    conCodigo, permitidosCodigo, ['VUELVE-A3F2'],
  );
  assert.deepEqual(r, conCodigo);
});

test('RECHAZA la reescritura si la IA altera el código', () => {
  const r = validarMensajePersonalizado(
    json('¿Volvemos?', 'Hola Marta, usa el código VUELVE A3F2 (15%).'),
    conCodigo, permitidosCodigo, ['VUELVE-A3F2'],
  );
  assert.deepEqual(r, conCodigo);
});
