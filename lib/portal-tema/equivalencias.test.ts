import test from 'node:test';
import assert from 'node:assert/strict';

import { BLOQUE_EDITOR_A_KIT, BLOQUE_KIT_A_EDITOR, elTemaIncluye, ordenDelInicio } from './equivalencias.ts';
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
  // ⚠️ Este test decía que los cinco del kit no tenían equivalente. Dejó de ser
  // verdad el 2026-08-14, cuando se les dio ficha en el editor para poder
  // ordenarlos y ocultarlos — y falló, que es exactamente lo que tenía que
  // hacer. Lo que sigue sin tenerlo son los dos saludos del kit.
  assert.equal(BLOQUE_KIT_A_EDITOR.greeting, undefined);
  assert.equal(BLOQUE_KIT_A_EDITOR.headline, undefined);

  // `studio-quote` es la cita del TEMA; `contenidoEstudio` es lo que escribe
  // la propietaria. Se parecen y no son lo mismo: cada una con su ficha.
  assert.equal(BLOQUE_EDITOR_A_KIT.contenidoEstudio, 'studio-banner');
  assert.equal(BLOQUE_EDITOR_A_KIT.citaEstudio, 'studio-quote');

  assert.equal(elTemaIncluye('invitarAmiga', TEMAS_PORTAL.tentada.home_blocks), false);
});

// ── El orden lo manda el estudio ────────────────────────────────────────────

const TEMA = ['home-header', 'next-class', 'week-strip', 'studio-quote'];
const sis = (sistemaId: string, oculto?: boolean) => ({ kind: 'sistema', sistemaId, oculto });

test('sin bloques guardados manda el tema — nadie ve un cambio', () => {
  // El caso de los 13 estudios el día que esto se despliega.
  assert.deepEqual(ordenDelInicio(TEMA, undefined), TEMA);
  assert.deepEqual(ordenDelInicio(TEMA, []), TEMA);
});

test('el orden guardado gana', () => {
  const r = ordenDelInicio(TEMA, [sis('tiraSemana'), sis('cabecera'), sis('proximaClase')]);
  assert.deepEqual(r.slice(0, 3), ['week-strip', 'home-header', 'next-class']);
});

test('un bloque oculto no se pinta, ni siquiera por la puerta de atrás', () => {
  // ⚠️ El de atrás importa: `studio-quote` NO está en la lista guardada, así
  // que entraría por la regla de «lo que el tema trae y no ordenó, al final».
  // Ocultarlo tiene que ganar a eso o el ojo no sirve para nada.
  const r = ordenDelInicio(TEMA, [sis('cabecera'), sis('contenidoEstudio', true)]);
  assert.ok(!r.includes('studio-banner'));
  const r2 = ordenDelInicio(TEMA, [sis('tiraSemana', true), sis('cabecera')]);
  assert.ok(!r2.includes('week-strip'), 'oculto y además guardado');
});

test('lo que el tema trae y el estudio nunca ordenó va al FINAL, no se pierde', () => {
  // Si mañana un tema añade una sección, tiene que aparecer — no desaparecer
  // por no estar en una lista guardada hace meses.
  const r = ordenDelInicio(TEMA, [sis('proximaClase')]);
  assert.equal(r[0], 'next-class');
  assert.deepEqual(r.slice(1), ['home-header', 'week-strip', 'studio-quote']);
});

test('⚠️ lo que el kit no sabe pintar se ignora, no deja hueco', () => {
  // Los 10 del catálogo (`texto`, `galeria`…) todavía no tienen renderizador
  // en el kit. Colarlos pintaría un hueco vacío en el portal de la socia.
  const r = ordenDelInicio(TEMA, [{ kind: 'texto' }, sis('cabecera'), { kind: 'galeria' }]);
  assert.deepEqual(r, ['home-header', 'next-class', 'week-strip', 'studio-quote']);
});

test('una sección que el TEMA no compone no se cuela por estar guardada', () => {
  // `retos` existe en el editor y en el kit, pero este tema no lo lista.
  const r = ordenDelInicio(TEMA, [sis('retos'), sis('cabecera')]);
  assert.ok(!r.includes('challenges'));
});

test('un id repetido no duplica la sección', () => {
  const r = ordenDelInicio(TEMA, [sis('cabecera'), sis('cabecera')]);
  assert.equal(r.filter((x) => x === 'home-header').length, 1);
});

// ── `fijo` gana a `oculto` ───────────────────────────────────────────────────
//
// Medido en producción (cadena de `tentare`, 2026-08-14): `cabecera` llegaba
// con `{ fijo: true, oculto: true }` a la vez — combinación real, no un dato
// corrupto. En el portal de siempre es inofensiva (el editor pinta los
// bloques `fijo` siempre, sin mirar su `oculto`: «no se mueven ni se
// ocultan», `portal-bloques-editor.tsx`). `ordenDelInicio` era el PRIMER
// sitio que sí miraba ese `oculto`, y le borraba a Tentada su cabecera con
// foto con datos que en el portal viejo nunca tuvieron ese efecto.

test('⚠️ un bloque `fijo` se pinta aunque venga `oculto` — el caso real de producción', () => {
  const r = ordenDelInicio(TEMA, [{ kind: 'sistema', sistemaId: 'cabecera', oculto: true, fijo: true }]);
  assert.ok(r.includes('home-header'), 'la cabecera fija no debería desaparecer por un oculto heredado');
});

test('sin `fijo`, `oculto` sigue ocultando — no se ha desactivado la regla', () => {
  const r = ordenDelInicio(TEMA, [sis('cabecera', true)]);
  assert.ok(!r.includes('home-header'));
});

test('un `fijo` oculto no se cuela DOS veces (una por fijo, otra al final por no-ocultado)', () => {
  const r = ordenDelInicio(TEMA, [{ kind: 'sistema', sistemaId: 'cabecera', oculto: true, fijo: true }]);
  assert.equal(r.filter((x) => x === 'home-header').length, 1);
});
