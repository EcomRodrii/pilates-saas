import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test ESTRUCTURAL (lee el fuente), mismo idioma que
// lib/student/cadena-rechazo-reserva.test.ts: ni `lib/supabase-data.ts` ni los
// componentes se pueden importar desde el runner porque resuelven el alias `@/`.
//
// Por qué existe: la fila de un recibo FALLIDO ofrecía el botón «Cobrar» —con
// un comentario al lado explicando que se cobra igual que un PENDIENTE— y el
// escritor lo rechazaba con `.eq('estado','PENDIENTE')`. La socia pagaba en
// efectivo, la propietaria pulsaba Cobrar y leía «ya no está pendiente». Con el
// bloqueo por impago encendido (#1664) eso la dejaba SIN PODER RESERVAR y sin
// ninguna vía de UI para arreglarlo.
//
// El botón y el escritor viven en ficheros distintos, así que ningún test de
// uno miraba al otro. Esto los ata.

import { ESTADOS_COBRABLES } from '../billing/deuda-recibo.ts';

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

/**
 * El fuente SIN comentarios.
 *
 * ⚠️ Imprescindible en un test estructural, y este repo ya se ha tropezado:
 * los comentarios de Tentare citan el código que sustituyen («antes esto era
 * `recibo.estado !== 'PENDIENTE'`»), así que un `doesNotMatch` contra el
 * fichero entero da rojo con el arreglo APLICADO — y un `match` da verde con
 * el arreglo BORRADO si la explicación sigue en la cabecera. Las dos
 * direcciones del mismo error.
 */
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Los tres estados que son DEUDA VIVA y por tanto se pueden cobrar.
 *
 * ⚠️ 26ª pasada: ya no se escriben aquí. Se DERIVAN de `ESTADOS_COBRABLES`
 * (`lib/billing/deuda-recibo.ts`), que es la lista que consultan la RPC
 * `socio_tiene_impago`, `/api/stripe/checkout` y `confirmarCobroRecibo`.
 * Repetirla a mano en el test era volver a tener dos listas: si mañana se
 * añade un estado de deuda, este test tiene que exigirlo en TODOS los
 * escritores sin que nadie se acuerde de tocarlo.
 */
const COBRABLES: readonly string[] = ESTADOS_COBRABLES;

test('el escritor de «marcar cobrado» acepta los tres estados de deuda', () => {
  const fuente = leer('lib/supabase-data.ts');
  const bloque = fuente.slice(fuente.indexOf('export async function dbMarcarCobrado'));
  const cuerpo = bloque.slice(0, bloque.indexOf('\n}\n'));
  for (const estado of COBRABLES) {
    assert.match(cuerpo, new RegExp(`'${estado}'`),
      `dbMarcarCobrado tiene que casar '${estado}': es deuda viva y el panel ofrece cobrarlo.`);
  }
  assert.doesNotMatch(cuerpo, /\.eq\('estado', 'PENDIENTE'\)/,
    'Volver a filtrar solo PENDIENTE deja los recibos fallidos y devueltos sin salida.');
});

test('el cobro en lote alcanza los mismos estados que el individual', () => {
  const fuente = leer('lib/supabase-data.ts');
  const bloque = fuente.slice(fuente.indexOf('export async function dbUpdateRecibosBatch'));
  const cuerpo = bloque.slice(0, bloque.indexOf('\n}\n'));
  for (const estado of COBRABLES) {
    assert.match(cuerpo, new RegExp(`'${estado}'`),
      `El cobro masivo saltaba en silencio los '${estado}' — justo los recibos por los que se usa.`);
  }
});

test('el panel ofrece «Cobrar» en los tres estados de deuda, no en dos', () => {
  const fuente = leer('components/cobros/panel-pendientes.tsx');
  for (const estado of COBRABLES) {
    assert.match(fuente, new RegExp(`r\\.estado === '${estado}'`),
      `Sin el botón para '${estado}', ese recibo no tiene NINGUNA vía de UI para resolverse.`);
  }
});

// La otra mitad del mismo bug: lo que la alumna lee.
test('a la alumna no se le dice que le devolvieron el dinero cuando lo debe', () => {
  const item = leer('components/student/domain/PaymentItem.tsx');
  assert.doesNotMatch(item, /txt: 'Reembolsado'/,
    "'DEVUELTO' es «devuelto por el banco» (deuda), no un reembolso a su favor.");
  assert.match(item, /Devuelto por el banco/,
    'La app y el panel tienen que llamarlo igual: es el mismo hecho.');

  const detalle = leer('app/portal/[slug]/pagos/[pagoId]/page.tsx');
  assert.doesNotMatch(detalle, /Este importe se te devolvió/,
    'Decía lo contrario de la verdad mientras el sistema la bloqueaba por deberlo.');
});

// ─────────────────────────────────────────────────────────────────────────────
// La MITAD ONLINE de la misma familia (26ª pasada).
//
// El test de arriba ató el botón del panel con su escritor y dejó fuera el
// camino por el que paga la SOCIA: `/api/stripe/checkout` abre la sesión de
// pago y `confirmarCobroRecibo` la cierra. Si esos dos no aceptan los mismos
// estados que el panel, el fallo cambia de forma pero no desaparece:
//   · si el checkout es más estricto → la socia no puede pagar lo que le
//     bloquea la reserva (el callejón de #1694, tercer escritor sin arreglar);
//   · si el checkout es más LAXO que el confirmador → la socia paga de verdad,
//     el UPDATE toca 0 filas y se queda sin bono, sin factura y sin email.
//     Cobrado y sin entregar, que es peor.
// ─────────────────────────────────────────────────────────────────────────────

test('el checkout de la socia no es más estricto que el panel', () => {
  const fuente = sinComentarios(leer('app/api/stripe/checkout/route.ts'));
  assert.doesNotMatch(fuente, /recibo\.estado !== 'PENDIENTE'/,
    'Volver a exigir PENDIENTE deja a la socia bloqueada por un recibo que no puede pagar.');
  assert.match(fuente, /esReciboCobrable\(/,
    'El checkout tiene que decidir con el criterio compartido, no con una lista propia.');
});

test('el confirmador acepta TODO lo que el checkout deja pagar', () => {
  const fuente = sinComentarios(leer('lib/billing/confirmar-cobro.ts'));
  const bloque = fuente.slice(fuente.indexOf('export async function confirmarCobroRecibo'));
  const cuerpo = bloque.slice(0, bloque.indexOf('\n}\n'));
  // Se exige la derivación, no el literal: una lista escrita a mano aquí
  // volvería a poder divergir del checkout sin que nada se entere.
  assert.match(cuerpo, /\.in\('estado', \[\.\.\.ESTADOS_COBRABLES/,
    'confirmarCobroRecibo tiene que derivar sus estados de ESTADOS_COBRABLES: si el checkout '
    + 'deja pagar un estado que este UPDATE no casa, se cobra el dinero y no se entrega nada.');
  // Y que las guardas de reembolso sigan ahí: aceptar DEVUELTO no puede
  // significar resucitar un recibo que se le devolvió a la socia.
  assert.match(cuerpo, /\.is\('reembolso_stripe_id', null\)/);
  assert.match(cuerpo, /\.is\('reembolso_solicitado_en', null\)/);
});
