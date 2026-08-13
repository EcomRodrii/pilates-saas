import test from 'node:test';
import assert from 'node:assert/strict';

import { BLOQUE_EDITOR_A_KIT, BLOQUE_KIT_A_EDITOR, elTemaIncluye } from './equivalencias.ts';
import { TEMAS_PORTAL, TEMAS_PORTAL_IDS } from '../../themes/registro.ts';

/**
 * ⚠️ `studio-banner` existe en el registro del kit y **ningún tema lo compone**.
 * No es una errata: es un hueco real. `contenidoEstudio` —el mensaje y los
 * banners que escribe la propietaria— no tiene sitio en ninguna composición del
 * kit, así que un estudio que los tuviera dejaría de enseñarlos al encenderlo.
 * Hoy no cuesta nada (cero banners en los 13 estudios, comprobado el
 * 2026-08-13) y por eso se documenta en vez de inventarle un sitio.
 */
const SIN_TEMA_QUE_LO_COMPONGA = new Set(['studio-banner']);

test('la tabla apunta a bloques que el kit sabe pintar', () => {
  // ⚠️ Un nombre mal escrito aquí no falla en ningún sitio: el editor
  // simplemente dejaría de encontrar ese bloque, en silencio. Se cruza contra
  // los `home_blocks` declarados por los temas, que es el catálogo real.
  const delKit = new Set(TEMAS_PORTAL_IDS.flatMap((id) => TEMAS_PORTAL[id].home_blocks));
  for (const kit of Object.values(BLOQUE_EDITOR_A_KIT)) {
    if (SIN_TEMA_QUE_LO_COMPONGA.has(kit)) continue;
    assert.ok(delKit.has(kit as never), `«${kit}» no lo compone ningún tema del kit`);
  }
});

test('⚠️ el mensaje y los banners de la propietaria no caben en ningún tema', () => {
  // Si algún día un tema compone `studio-banner`, este test cae y hay que
  // quitarlo — es el aviso de que el hueco se cerró.
  for (const id of TEMAS_PORTAL_IDS) {
    assert.equal(elTemaIncluye('contenidoEstudio', TEMAS_PORTAL[id].home_blocks), false, id);
  }
});

test('la vuelta es exacta', () => {
  for (const [editor, kit] of Object.entries(BLOQUE_EDITOR_A_KIT)) {
    assert.equal(BLOQUE_KIT_A_EDITOR[kit], editor);
  }
});

test('elTemaIncluye responde por TEMA, no por existencia', () => {
  const tentada = TEMAS_PORTAL.tentada.home_blocks;
  assert.equal(elTemaIncluye('cabecera', tentada), true);
  assert.equal(elTemaIncluye('proximaClase', tentada), true);
  // Tentada NO compone accesos rápidos ni retos, aunque el kit sepa pintarlos:
  // el rail tiene que decirlo en vez de listar una sección que no aparece.
  assert.equal(elTemaIncluye('accesosRapidos', tentada), false);
  assert.equal(elTemaIncluye('retos', tentada), false);
});

test('lo que no tiene equivalente no se inventa', () => {
  // `studio-quote` es la cita del TEMA; `contenidoEstudio` es lo que escribe
  // la propietaria. Se parecen y no son lo mismo.
  assert.equal(BLOQUE_EDITOR_A_KIT.contenidoEstudio, 'studio-banner');
  assert.equal(BLOQUE_KIT_A_EDITOR['studio-quote'], undefined);
  for (const kit of ['streak-pill', 'pass-card', 'bookings-list', 'videos-cta']) {
    assert.equal(BLOQUE_KIT_A_EDITOR[kit], undefined, kit);
  }
  assert.equal(elTemaIncluye('invitarAmiga', TEMAS_PORTAL.tentada.home_blocks), false);
});
