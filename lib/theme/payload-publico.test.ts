import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// El guardián que le faltaba al sistema de temas.
//
// Los valores de tema viajan por TRES carriles y solo dos tenían prueba
// automática:
//   1. CSS `:root`      (vocabulario viejo)  → cubierto por theme-preview-vars
//   2. CSS `:root:root` (kit)                → cubierto por theme-preview-vars
//   3. valores JS en `camposTema`            → SIN cubrir  ← este fichero
//
// Por el tercero se coló `barraFlotante`: el interruptor existía en el editor,
// el puente del PREVIEW lo transportaba, `studio-context` hacía
// `setBarraFlotante(pub.barraFlotante === true)`… y `camposTema` nunca lo
// emitía, así que `pub.barraFlotante` era SIEMPRE `undefined`. El editor
// enseñaba la barra flotante y el portal de las socias seguía con la de
// siempre. El e2e que había miraba el cuerpo del PATCH de guardado —o sea, que
// el editor lo GUARDA—, nunca que el portal lo LEE.
//
// El contrato que se comprueba aquí es el que se rompió, ni más ni menos:
//   todo eje de tema/nav que `CoreContextValue` transporta como valor JS
//   tiene que estar en el payload público `camposTema`.
//
// Las dos listas se EXTRAEN del código, no se escriben a mano: un eje nuevo
// entra solo en la cobertura. (Un test que construye su entrada a mano puede
// estar validando un camino que ningún llamante recorre — ya pasó en este
// mismo subsistema con las miniaturas.)
// ─────────────────────────────────────────────────────────────────────────────

const url = (p: string) => new URL(p, import.meta.url);

/** Campos que `PortalShell` recibe ya resueltos, declarados en CoreContextValue. */
function ejesDelCore(): string[] {
  const fuente = readFileSync(url('../core-context.tsx'), 'utf8');
  const i = fuente.indexOf('  navPortal: NavConfigShape;');
  const j = fuente.indexOf('  portalReact: boolean;');
  assert.ok(i !== -1 && j > i, 'no se localiza el bloque de tema/nav de CoreContextValue — actualiza este guardián');
  return [...fuente.slice(i, j).matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
}

/** Claves del objeto que el servidor manda al portal publicado. */
function bloqueCamposTema(): string {
  const fuente = readFileSync(url('../db/supabase-data-admin.ts'), 'utf8');
  const i = fuente.indexOf('const camposTema = {');
  assert.notEqual(i, -1, 'no se encuentra `const camposTema = {` — ¿lo renombraron?');
  const j = fuente.indexOf('\n  };', i);
  assert.notEqual(j, -1, 'no se encuentra el cierre del objeto camposTema');
  return fuente.slice(i, j);
}

const emite = (bloque: string, id: string) => new RegExp(`(^|[^\\w])${id}\\s*:`, 'm').test(bloque);

test('camposTema emite todos los ejes de tema/nav que consume el portal', () => {
  const ejes = ejesDelCore();
  // Control de que la extracción no se quedó en nada: si el fichero cambia de
  // forma y `ejes` sale vacío, el filtro de abajo daría verde sin comprobar nada.
  assert.ok(ejes.length >= 5, `se esperaban ≥5 ejes en CoreContextValue, se extrajeron ${ejes.length}`);

  const bloque = bloqueCamposTema();
  const ausentes = ejes.filter(id => !emite(bloque, id));

  assert.deepEqual(
    ausentes, [],
    'Estos ejes se pueden configurar y publicar, pero NO viajan en el payload público: ' +
    `cambian el PREVIEW y no el portal de las socias → ${ausentes.join(', ')}`,
  );
});

test('control positivo: el guardián detecta de verdad un eje ausente', () => {
  // Sin esto, cualquier cambio que rompiera la extracción (un bloque que se
  // devuelve entero, un regex que casa siempre) dejaría el test anterior en
  // verde para siempre sin comprobar nada — que es exactamente cómo
  // `barraFlotante` sobrevivió a un e2e "en verde".
  const bloqueFalso = 'const camposTema = {\n    barraClasica: x,\n';
  assert.ok(!emite(bloqueFalso, 'barraFlotante'), 'tiene que ver la ausencia');
  assert.ok(emite(bloqueFalso, 'barraClasica'), 'y no marcar ausente el que sí está');
});

test('portalReact queda fuera a propósito, y consta por qué', () => {
  // No es un eje de tema: viaja dentro de `pub.studio`, no de `camposTema`. Se
  // documenta para que la próxima persona no lo "arregle" añadiéndolo.
  const fuente = readFileSync(url('../core-context.tsx'), 'utf8');
  assert.ok(fuente.includes('  portalReact: boolean;'), 'si desaparece, revisar ejesDelCore()');
  assert.ok(!ejesDelCore().includes('portalReact'));
});
