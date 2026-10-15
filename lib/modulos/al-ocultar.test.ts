import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_OCULTABLES, bottomNavItems } from '../nav-config.ts';
import { siempreEnElMenu } from './menu.ts';
import { seccionesDelMenu } from '../nav-panel-nuevo.ts';
import { LO_PROPIO, alOcultar, type DatosAlOcultar } from './al-ocultar.ts';

const SIN_DATOS: DatosAlOcultar = {
  reservasProximas: null, citasProximas: null, serviciosCitaOnline: null, automatizacionesEncendidas: null,
  paquetesActivos: null, recibosSinCobrar: null, mensajesSinLeer: null, enCadena: false,
};
const CEROS: DatosAlOcultar = {
  reservasProximas: 0, citasProximas: 0, serviciosCitaOnline: 0, automatizacionesEncendidas: 0,
  paquetesActivos: 0, recibosSinCobrar: 0, mensajesSinLeer: 0, enCadena: false,
};

const ocultables = () => seccionesDelMenu(true).flatMap(s => s.items).filter(i => !siempreEnElMenu(i.href));

test('cada módulo que se puede ocultar dice qué pasa al ocultarlo (uno nuevo sin su entrada falla aquí)', () => {
  for (const m of ocultables()) assert.ok(LO_PROPIO[m.href], `${m.href} sin su entrada en LO_PROPIO`);
});

test('siempre: qué deja de verse en el menú, qué notan las alumnas, que no se borra nada y que el ⌘K lo encuentra', () => {
  for (const m of ocultables()) {
    for (const d of [SIN_DATOS, CEROS]) {
      const r = alOcultar(m, d);
      assert.match(r.dejaDeVerse[0], new RegExp(`«${m.label}» en el menú, para ti y para tu equipo\\.`), m.href);
      assert.ok(r.enLaApp.length > 0, m.href);
      assert.ok(r.sigueIgual.some(l => l.startsWith('No se borra nada')), m.href);
      assert.ok(r.sigueIgual.some(l => l.includes('⌘K')), m.href);
    }
  }
});

test('sin cifras (no han llegado) o con cero, ningún aviso afirma una cifra', () => {
  for (const m of ocultables()) {
    for (const d of [SIN_DATOS, CEROS]) {
      const { aviso } = alOcultar(m, d);
      if (aviso) assert.doesNotMatch(aviso, /\d/, `${m.href}: ${aviso}`);
    }
  }
});

test('en una cadena dice que se oculta en todas las sedes; los de la barra del móvil lo dicen también', () => {
  const r = alOcultar({ href: '/informes', label: 'Informes' }, { ...SIN_DATOS, enCadena: true });
  assert.match(r.dejaDeVerse[0], /en todas tus sedes/);
  for (const i of bottomNavItems.filter(i => !NO_OCULTABLES.includes(i.href))) {
    assert.ok(alOcultar(i, SIN_DATOS).dejaDeVerse.includes('Su botón en la barra de abajo del móvil.'), i.href);
  }
  assert.ok(!alOcultar({ href: '/informes', label: 'Informes' }, SIN_DATOS).dejaDeVerse.includes('Su botón en la barra de abajo del móvil.'));
});

test('avisa con su cifra de lo que toca a las alumnas o queda pendiente', () => {
  const con = (p: Partial<DatosAlOcultar>) => ({ ...CEROS, ...p });
  assert.match(alOcultar({ href: '/calendario', label: 'Calendario' }, con({ reservasProximas: 12 })).aviso ?? '', /^Hay 12 reservas en tus próximas clases\. Siguen en pie/);
  assert.match(alOcultar({ href: '/calendario', label: 'Calendario' }, con({ reservasProximas: 1 })).aviso ?? '', /^Hay 1 reserva en tus próximas clases\. Sigue en pie/);
  assert.match(alOcultar({ href: '/automatizaciones', label: 'Automatizaciones' }, con({ automatizacionesEncendidas: 3 })).aviso ?? '', /3 automatizaciones encendidas: seguirán escribiendo a tus alumnas/);
  assert.match(alOcultar({ href: '/citas', label: 'Citas' }, con({ citasProximas: 2, serviciosCitaOnline: 1 })).aviso ?? '', /2 citas por delante: siguen en pie\. Y tus alumnas pueden pedir más/);
  assert.match(alOcultar({ href: '/mensajeria', label: 'Mensajería' }, con({ mensajesSinLeer: 4 })).aviso ?? '', /4 conversaciones sin leer/);
  assert.match(alOcultar({ href: '/cobros', label: 'Cobros' }, con({ recibosSinCobrar: 1 })).aviso ?? '', /1 recibo sin cobrar: sigue pendiente/);
  // Lo que solo ve el estudio no lleva aviso.
  assert.equal(alOcultar({ href: '/informes', label: 'Informes' }, con({ reservasProximas: 12 })).aviso, null);
});

test('lo que la alumna puede hacer sola solo se afirma si de verdad puede', () => {
  assert.equal(alOcultar({ href: '/citas', label: 'Citas' }, CEROS).enLaApp, 'No cambia nada.');
  assert.match(alOcultar({ href: '/citas', label: 'Citas' }, { ...CEROS, serviciosCitaOnline: 2 }).enLaApp, /pueden seguir pidiendo citas/);
  assert.equal(alOcultar({ href: '/productos', label: 'Paquetes' }, SIN_DATOS).enLaApp, 'No cambia nada.');
  assert.match(alOcultar({ href: '/productos', label: 'Paquetes' }, { ...CEROS, paquetesActivos: 3 }).enLaApp, /pueden seguir comprando/);
});
