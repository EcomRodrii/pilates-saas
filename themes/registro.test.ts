import test from 'node:test';
import assert from 'node:assert/strict';

import { TEMA_PORTAL_POR_DEFECTO, TEMAS_PORTAL_IDS, esTemaPortal, themeIdSeguro } from './registro.ts';

// ⚠️ `themeIdSeguro` existe porque ya se rompió una vez sin él: escribir un
// `themeId` que no sea uno de los cuatro del kit deja `esTemaPortal()` en
// `false` en el siguiente render, `PortalShell` cierra la puerta y el portal
// REAL de la socia cae al de siempre — en silencio, sin ningún error. Pasó de
// verdad con el literal `'importado'` de la extracción de temas ZIP, dos días
// sin que nadie lo notara en un estudio con socias reales.

test('un id de los cuatro del kit se conserva tal cual', () => {
  for (const id of TEMAS_PORTAL_IDS) {
    assert.equal(themeIdSeguro(id), id);
  }
});

test('⚠️ un id que no es del kit NUNCA se persiste — cae al por defecto', () => {
  // Este es el caso exacto que rompió el portal del piloto.
  assert.equal(themeIdSeguro('importado'), TEMA_PORTAL_POR_DEFECTO);
  assert.equal(themeIdSeguro('cualquier-cosa'), TEMA_PORTAL_POR_DEFECTO);
});

test('null/undefined/vacío también caen al por defecto, no revientan', () => {
  assert.equal(themeIdSeguro(null), TEMA_PORTAL_POR_DEFECTO);
  assert.equal(themeIdSeguro(undefined), TEMA_PORTAL_POR_DEFECTO);
  assert.equal(themeIdSeguro(''), TEMA_PORTAL_POR_DEFECTO);
});

test('el resultado siempre pasa esTemaPortal, sea cual sea la entrada', () => {
  for (const entrada of [null, undefined, '', 'importado', 'tentada', 'ruido-123']) {
    assert.equal(esTemaPortal(themeIdSeguro(entrada)), true, `entrada: ${entrada}`);
  }
});

test('acepta un "por defecto" propio, para cuando ya se sabe cuál usar', () => {
  assert.equal(themeIdSeguro('importado', 'noir'), 'noir');
  assert.equal(themeIdSeguro('oliva', 'noir'), 'oliva');
});
