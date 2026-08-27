import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { firmaMetaValida } from './meta-firma.ts';

const SECRETO = 'app-secret-de-prueba';
const CUERPO = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

function firmar(secreto: string, cuerpo: string): string {
  return `sha256=${createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex')}`;
}

test('firma válida: mismo secreto, mismo cuerpo', () => {
  assert.equal(firmaMetaValida(SECRETO, CUERPO, firmar(SECRETO, CUERPO)), true);
});

test('cuerpo modificado tras firmar: la firma ya no vale', () => {
  const firma = firmar(SECRETO, CUERPO);
  const cuerpoAlterado = CUERPO.replace('whatsapp_business_account', 'instagram');
  assert.equal(firmaMetaValida(SECRETO, cuerpoAlterado, firma), false);
});

test('secreto equivocado: la firma no vale aunque el formato sea correcto', () => {
  const firma = firmar('otro-secreto-distinto', CUERPO);
  assert.equal(firmaMetaValida(SECRETO, CUERPO, firma), false);
});

test('sin header de firma: se rechaza, nunca se acepta "porque no venía"', () => {
  assert.equal(firmaMetaValida(SECRETO, CUERPO, null), false);
});

test('firma sin el prefijo "sha256=": formato inesperado, se rechaza', () => {
  const digest = createHmac('sha256', SECRETO).update(CUERPO, 'utf8').digest('hex');
  assert.equal(firmaMetaValida(SECRETO, CUERPO, digest), false);
});

test('firma de longitud distinta a la esperada: se rechaza sin lanzar', () => {
  assert.equal(firmaMetaValida(SECRETO, CUERPO, 'sha256=abc123'), false);
});
