import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlPopupPermitida } from './popup-url.ts';

const O = 'https://www.tentare.app';

test('abre la vista incrustada de Tentare, con sus parámetros intactos (y marcada como ventana)', () => {
  assert.equal(
    urlPopupPermitida(`${O}/reservar/pilates-centro?embed=1&tab=planes&planes=BONO&ref=web-bonos`, O),
    `${O}/reservar/pilates-centro?embed=1&tab=planes&planes=BONO&ref=web-bonos&ventana=1`,
  );
});

test('el apex cuenta como www, y siempre se fuerza embed=1', () => {
  assert.equal(urlPopupPermitida('https://tentare.app/reservar/x?tab=clases', O), `${O}/reservar/x?tab=clases&embed=1&ventana=1`);
});

test('⚠️ siempre `ventana=1`: el estilo de su web no se funde en el marco blanco del popup', () => {
  // Lo pone el script al abrir, no el código copiado: un popup pegado hace
  // meses lo lleva igual. Y no se puede quitar desde el código pegado.
  assert.equal(new URL(urlPopupPermitida(`${O}/reservar/x?embed=1&ventana=0`, O)!).searchParams.get('ventana'), '1');
  assert.equal(new URL(urlPopupPermitida(`${O}/reservar/x`, O)!).searchParams.getAll('ventana').length, 1);
});

test('⚠️ nada que no sea /reservar/<slug> de Tentare', () => {
  for (const mala of [
    'https://evil.example/reservar/x?embed=1',
    `${O}/configuracion`,
    `${O}/reservar/x/../../api/public/studio-data`,
    'javascript:alert(1)',
    `${O}/reservar/<script>`,
    null,
    '',
  ]) assert.equal(urlPopupPermitida(mala, O), null, String(mala));
});
