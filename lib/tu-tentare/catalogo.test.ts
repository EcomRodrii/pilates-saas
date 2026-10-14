import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ESSENTIAL_HREFS, MODULOS, NO_OCULTABLES } from '../nav-config.ts';
import { RUTAS_CONGELADAS } from '../frozen-features.ts';
import { valorDeModulo, AYUDA_POR_PANTALLA } from '../ayuda/pantallas.ts';
import { PLAN_ENTITLEMENTS, PLANES, accesoProducto, tieneFeature } from '../billing/entitlements.ts';
import { resolverHref, puedeAbrirEnConfiguracion } from '../configuracion/destino.ts';
import {
  CONFIGURAR, FEATURE_DE_MODULO, contar, estadoEnMenu, gruposTuTentare, incluidoEnPlan, ocultosTrasCambiar, planQueFalta, planQueLoIncluye,
} from './catalogo.ts';

const todos = () => gruposTuTentare().flatMap(g => g.modulos);
const congelado = (h: string) => RUTAS_CONGELADAS.some(p => h === p || h.startsWith(`${p}/`));

const FRASES = () => Object.fromEntries(MODULOS.map(m => [m.href, valorDeModulo(m.href) ?? '']));

test('cada módulo del menú está, con su frase, y solo las pantallas del menú llevan frase', () => {
  assert.deepEqual(todos().map(m => m.href).sort(), MODULOS.map(m => m.href).sort());
  for (const m of todos()) assert.ok(m.frase.length > 20, `${m.href} sin frase`);
  for (const [ruta, ficha] of Object.entries(AYUDA_POR_PANTALLA)) {
    if ('valor' in ficha) assert.ok(MODULOS.some(m => m.href === ruta), `frase de ${ruta}, que no está en el menú`);
  }
});

test('nada congelado, ni en los módulos ni en «Configurar»', () => {
  for (const m of todos()) assert.ok(!congelado(m.href), `${m.href} está congelado`);
  for (const destino of Object.values(CONFIGURAR)) assert.ok(!congelado(destino!), destino);
  for (const h of ['/chat', '/ondemand', '/network/buscar']) assert.ok(!todos().some(m => m.href === h), h);
});

test('frases verdaderas y cortas: sin «próximamente» ni palabras vacías', () => {
  for (const [h, frase] of Object.entries(FRASES())) {
    assert.ok(frase.length <= 140, `${h}: ${frase.length} caracteres`);
    assert.doesNotMatch(frase, /próximamente|pronto|en construcción|en desarrollo/i, h);
    assert.doesNotMatch(frase, /\b(gestion|optimiz|centraliz)/i, h);
  }
  // Promesas que eran falsas y no pueden volver (Sustituciones no busca sola de
  // serie; Cobros solo cobra solo con tarjeta o domiciliación; la Libreta no
  // lleva notas; Network está congelado).
  const f = FRASES();
  assert.doesNotMatch(f['/sustituciones'], /busca sustituta sola|avisa a las alumnas|Network/i);
  assert.match(f['/sustituciones'], /visto bueno/);
  assert.doesNotMatch(f['/cobros'], /la mayoría se cobra sola/i);
  // Solo la tarjeta guardada se cobra sola; la domiciliación va por remesa al banco.
  assert.match(f['/cobros'], /tarjeta guardada se cobra sola/);
  assert.doesNotMatch(f['/cobros'], /domiciliación guardada se cobra sola/);
  assert.doesNotMatch(f['/libreta'], /notas/i);
  assert.doesNotMatch(AYUDA_POR_PANTALLA['/sustituciones'].resumen, /Network/, 'Network está congelado en el panel');
});

test('lo que depende del plan: Centro de Control, del plan Estudio, y es lo que mira el servidor', () => {
  for (const [h, f] of Object.entries(FEATURE_DE_MODULO)) {
    assert.ok(MODULOS.some(m => m.href === h), h);
    assert.ok(f! in PLAN_ENTITLEMENTS.BASE.features, f);
  }
  const cdc = todos().find(m => m.href === '/centro-de-control')!;
  assert.equal(planQueLoIncluye(cdc), 'Estudio');
  assert.equal(incluidoEnPlan(cdc, 'BASE', true), false);
  assert.equal(incluidoEnPlan(cdc, 'ESTUDIO', true), true);
  assert.equal(incluidoEnPlan(cdc, null, true), null, 'sin plan, no se sabe');
  assert.equal(incluidoEnPlan(cdc, 'ESTUDIO', false), null, 'sin acceso (prueba agotada), no se sabe');
  // La puerta del servidor usa esa misma feature.
  assert.match(readFileSync(new URL('../decision/plan-decisiones.ts', import.meta.url), 'utf8'), /'decisiones'/);
  // Lo fijo no depende de ningún plan.
  for (const h of NO_OCULTABLES) assert.equal(FEATURE_DE_MODULO[h], undefined, h);
});

test('«Configurar» lleva a un ajuste que existe y que la propietaria puede abrir', () => {
  for (const [h, destino] of Object.entries(CONFIGURAR)) {
    assert.ok(MODULOS.some(m => m.href === h), h);
    assert.ok(resolverHref(destino!).tab, `${destino} no resuelve`);
    assert.ok(puedeAbrirEnConfiguracion('PROPIETARIO', destino!), destino);
  }
});

test('dónde se ve: en el menú, solo con «Todo», o fuera; lo fijo nunca fuera', () => {
  const m = (href: string) => todos().find(x => x.href === href)!;
  const ocultos = new Set(['/libreta', '/calendario', '/dashboard']);
  assert.equal(estadoEnMenu(m('/calendario'), ocultos), 'fuera');
  assert.equal(estadoEnMenu(m('/clientas'), ocultos), 'en-menu');
  assert.equal(estadoEnMenu(m('/libreta'), ocultos), 'fuera');
  assert.equal(estadoEnMenu(m('/pos'), ocultos), 'solo-todo');
  assert.equal(estadoEnMenu(m('/dashboard'), ocultos), 'en-menu', 'lo fijo no se esconde aunque el dato lo diga');
});

test('pulsar el interruptor cambia solo ese módulo y lo fijo nunca; las mismas reglas que el cajón «Tu menú»', () => {
  const m = (href: string) => todos().find(x => x.href === href)!;
  assert.deepEqual(ocultosTrasCambiar(['/libreta', '/pos'], m('/libreta'), true), ['/pos']);
  assert.deepEqual(ocultosTrasCambiar(['/pos'], m('/libreta'), false), ['/pos', '/libreta']);
  assert.deepEqual(ocultosTrasCambiar(['/pos', '/libreta'], m('/libreta'), false), ['/pos', '/libreta'], 'idempotente');
  assert.equal(ocultosTrasCambiar([], m('/dashboard'), false), null);
  // Como en el cajón: Centro de Control se pone y se quita sea cual sea el plan
  // (su pantalla ya dice que necesita el plan Estudio; la puerta está en el servidor).
  assert.deepEqual(ocultosTrasCambiar(['/centro-de-control'], m('/centro-de-control'), true), []);
});

test('el contador es la misma cifra que la fila «Tu menú»: lo encendido (y lo fijo) de todos', () => {
  const g = gruposTuTentare();
  const total = MODULOS.length;
  assert.deepEqual(contar(g, new Set()), { en: total, de: total });
  assert.deepEqual(contar(g, new Set(['/libreta', '/calendario'])), { en: total - 2, de: total });
  // Lo fijo cuenta aunque el dato diga «escondido» (no se puede esconder).
  assert.deepEqual(contar(g, new Set(['/dashboard'])), { en: total, de: total });
  assert.ok(ESSENTIAL_HREFS.length > 0 && NO_OCULTABLES.length === 3);
});

// La chapa «Desde el plan X» de la pantalla Módulos la decide `tieneFeature`, no
// una tabla propia: si un plan pasa a incluirlo todo (Founding Studio gratis,
// 15-oct-2026), la chapa se va sola. Por eso se compara contra `tieneFeature` y
// no contra un plan fijo.
test('«Desde el plan…» sale solo cuando `tieneFeature` dice que no, y nunca sin acceso al producto', () => {
  const conFeature = todos().filter(m => m.feature);
  assert.ok(conFeature.length > 0);
  for (const m of conFeature) {
    for (const plan of [...PLANES, null, 'RARO']) {
      for (const subscriptionStatus of ['active', 'trialing', 'past_due', 'canceled', 'trial_expirado', null]) {
        const studio = { plan, subscriptionStatus };
        const falta = accesoProducto(studio) && !tieneFeature(studio, m.feature!);
        assert.equal(planQueFalta(m, studio) !== null, falta, `${m.href} con ${plan}/${subscriptionStatus}`);
        if (falta) assert.equal(planQueFalta(m, studio), planQueLoIncluye(m));
      }
    }
  }
  // Sin estudio cargado, o un módulo que no depende del plan: nada.
  assert.equal(planQueFalta({ feature: 'decisiones' }, null), null);
  assert.equal(planQueFalta({ feature: null }, { plan: 'BASE', subscriptionStatus: 'active' }), null);
  // Con el plan que lo incluye, nunca.
  assert.equal(planQueFalta({ feature: 'decisiones' }, { plan: 'ESTUDIO', subscriptionStatus: 'active' }), null);
});
