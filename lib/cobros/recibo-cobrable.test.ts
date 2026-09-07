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

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

/** Los tres estados que son DEUDA VIVA y por tanto se pueden cobrar a mano. */
const COBRABLES = ['PENDIENTE', 'FALLIDO', 'DEVUELTO'];

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
