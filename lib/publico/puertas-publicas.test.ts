import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hashearClave, huellaClave, firmarAcceso, puertaPublica, respuestaPuertaPublica, catalogoPaginaOculta,
  MENSAJE_NO_ACEPTA_RESERVAS,
} from './acceso-pagina.ts';

// Decisión del fundador (16-sep): con la página oculta NO se reserva desde
// fuera. Antes «ocultar» solo escondía las pantallas, y las rutas públicas
// seguían reservando y cobrando. Aquí se fija la regla y que cada puerta la
// mira ANTES de escribir.

const SECRETO = 'secreto-de-prueba-no-usar-en-serio';
const STUDIO = 'studio-1';
const OTRO = 'studio-2';
const HASH = hashearClave('abrete sesamo');
const HUELLA = huellaClave(HASH) as string;
const PASE = firmarAcceso(STUDIO, HUELLA, Date.now(), SECRETO);

const oculta = { data: { pagina_publica_oculta: true, pagina_publica_clave_hash: HASH }, error: null };
const puerta = (lectura: Parameters<typeof puertaPublica>[0]['lectura'], pase: string | null) =>
  puertaPublica({ lectura, pase, studioId: STUDIO, claveFirma: SECRETO });

test('visible: la puerta está abierta, con pase o sin él', () => {
  assert.equal(puerta({ data: { pagina_publica_oculta: false, pagina_publica_clave_hash: HASH }, error: null }, null), 'abierta');
  assert.equal(puerta({ data: { pagina_publica_oculta: null }, error: null }, null), 'abierta');
});

test('oculta y sin pase: cerrada, con clave configurada o sin ella', () => {
  assert.equal(puerta(oculta, null), 'cerrada');
  assert.equal(puerta(oculta, 'basura'), 'cerrada');
  assert.equal(puerta({ data: { pagina_publica_oculta: true, pagina_publica_clave_hash: null }, error: null }, null), 'cerrada');
});

test('oculta con el pase de su clave vigente: abierta (quien entró con la clave reserva)', () => {
  assert.equal(puerta(oculta, PASE), 'abierta');
});

test('el pase de OTRO estudio no abre esta puerta', () => {
  assert.equal(puerta(oculta, firmarAcceso(OTRO, HUELLA, Date.now(), SECRETO)), 'cerrada');
});

test('clave cambiada o quitada: el pase de antes ya no abre', () => {
  const cambiada = { data: { pagina_publica_oculta: true, pagina_publica_clave_hash: hashearClave('otra clave') }, error: null };
  assert.equal(puerta(cambiada, PASE), 'cerrada');
  const quitada = { data: { pagina_publica_oculta: true, pagina_publica_clave_hash: null }, error: null };
  assert.equal(puerta(quitada, PASE), 'cerrada');
});

test('si no se ha podido leer, no se afirma nada: ni abierta ni cerrada', () => {
  assert.equal(puerta({ data: null, error: { message: 'timeout' } }, PASE), 'sin-leer');
  // Aunque venga una fila, con error no se decide sobre ella.
  assert.equal(puerta({ data: { pagina_publica_oculta: false }, error: { code: '57014' } }, null), 'sin-leer');
});

test('estudio que no existe: la puerta no inventa un cierre, responde la ruta lo de siempre', () => {
  assert.equal(puerta({ data: null, error: null }, null), 'abierta');
});

test('sin secreto para comprobar el pase, una página oculta sigue cerrada', () => {
  const guardados = { a: process.env.HOME_PREVIEW_TOKEN_SECRET, b: process.env.OAUTH_STATE_SECRET };
  delete process.env.HOME_PREVIEW_TOKEN_SECRET;
  delete process.env.OAUTH_STATE_SECRET;
  try {
    assert.equal(puertaPublica({ lectura: oculta, pase: PASE, studioId: STUDIO }), 'cerrada');
    // Y una visible no depende del secreto.
    assert.equal(puertaPublica({ lectura: { data: { pagina_publica_oculta: false }, error: null }, pase: null, studioId: STUDIO }), 'abierta');
  } finally {
    if (guardados.a !== undefined) process.env.HOME_PREVIEW_TOKEN_SECRET = guardados.a;
    if (guardados.b !== undefined) process.env.OAUTH_STATE_SECRET = guardados.b;
  }
});

test('la respuesta: 403 en español llano, 503 si no se pudo leer, nada si pasa', () => {
  assert.deepEqual(respuestaPuertaPublica('cerrada'), {
    status: 403, body: { error: MENSAJE_NO_ACEPTA_RESERVAS, codigo: 'PAGINA_OCULTA' },
  });
  assert.equal(MENSAJE_NO_ACEPTA_RESERVAS, 'Este estudio está preparando su página y todavía no acepta reservas.');
  assert.equal(respuestaPuertaPublica('sin-leer')?.status, 503);
  assert.equal(respuestaPuertaPublica('abierta'), null);
});

test('el catálogo con la página oculta lleva el nombre para el aviso y NADA más', () => {
  assert.deepEqual(catalogoPaginaOculta('Estudio de prueba'), { paginaOculta: true, nombre: 'Estudio de prueba' });
  assert.deepEqual(catalogoPaginaOculta(null), { paginaOculta: true, nombre: '' });
});

// ── Cada puerta mira la regla ANTES de escribir ─────────────────────────────

function fuente(ruta: string): string {
  return readFileSync(join(import.meta.dirname, '../..', ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const GATE = 'paginaCerradaParaPeticion(req, ';

function posicion(f: string, texto: string, ruta: string): number {
  const i = f.indexOf(texto);
  assert.ok(i >= 0, `${ruta}: no aparece «${texto}»`);
  return i;
}

/** El gate va antes de cada una de `peligros` (su primera aparición). */
function gateAntesDe(ruta: string, peligros: string[], opciones: { despuesDe?: string[]; veces?: number } = {}) {
  const f = fuente(ruta);
  const gate = posicion(f, GATE, ruta);
  assert.equal(f.split(GATE).length - 1, opciones.veces ?? 1, `${ruta}: el gate tiene que aparecer ${opciones.veces ?? 1} vez/veces`);
  for (const p of peligros) assert.ok(gate < posicion(f, p, ruta), `${ruta}: «${p}» va antes del gate`);
  for (const d of opciones.despuesDe ?? []) assert.ok(gate > posicion(f, d, ruta), `${ruta}: el gate va antes de «${d}»`);
  return f;
}

test('reservar clase: solo CREAR pasa por el gate, cancelar y valorar no', () => {
  const ruta = 'app/api/public/reserva/route.ts';
  const f = gateAntesDe(ruta, ['crearReservaPublica(', "body.accion === 'cancelar'"], { despuesDe: ["body.accion === 'crear'"] });
  assert.ok(f.includes('if (cerrada) return conCorsWidget(req, cerrada)'));
});

test('lista de espera: aceptar la plaza (widget y app de la alumna) pasa por el gate', () => {
  gateAntesDe('app/api/public/aceptar-oferta-espera/route.ts', ['aceptarOfertaListaEspera(']);
  gateAntesDe('app/api/reservas/aceptar-oferta-espera/route.ts', ['aceptarOfertaListaEspera(']);
});

test('cita 1:1: crear pasa por el gate, cancelar no', () => {
  gateAntesDe('app/api/public/citas/route.ts', ['crearCitaPublica(', "body.accion === 'cancelar'"], { despuesDe: ["body.accion === 'crear'"] });
});

test('plaza fija: pedir una plaza pasa por el gate antes de escribir la petición', () => {
  const f = gateAntesDe('app/api/public/plaza-fija/route.ts', ['solicitarPlazaFijaAlumna(']);
  assert.ok(f.includes("if (body.accion === 'solicitar_plaza')"));
});

test('checkout embebido: el gate va antes de la matrícula, de Stripe y de escribir la ficha', () => {
  gateAntesDe('app/api/public/checkout-embebido/route.ts', [
    'reservarMatricula(', 'stripe.customers.create(', 'stripe.paymentIntents.create(', ".update({ stripe_customer_id",
    "from('planes_tarifa')",
  ], { despuesDe: ['if (!body?.studioId)'] });
});

test('checkout de Stripe: la compra de PLAN pasa por el gate; pagar un recibo que se debe, no', () => {
  gateAntesDe('app/api/stripe/checkout/route.ts', [
    'reservarMatricula(', 'stripe.checkout.sessions.create(', "from('planes_tarifa')",
  ], { despuesDe: ['if (body.reciboId)', 'else if (body.planId)'] });
});

test('alta de alumna: registrar pasa por el gate antes de crear la ficha; actualizar no', () => {
  gateAntesDe('app/api/public/socio/route.ts', ['registrarSociaPublica(', 'registrarAceptacionContrato(', "body.accion === 'actualizar'"], {
    despuesDe: ["body.accion === 'registrar'"],
  });
});

test('renovar plan: el gate va antes de crear el recibo', () => {
  gateAntesDe('app/api/public/renovar-plan/route.ts', ['.insert(', "from('suscripciones')"]);
});

test('el gate lee la cookie del estudio pedido y decide con la regla pura', () => {
  const f = fuente('lib/publico/pagina-cerrada-peticion.ts');
  assert.ok(f.includes('nombreCookieAcceso(studioId)'));
  assert.ok(f.includes('puertaPublica('));
  assert.ok(f.includes('respuestaPuertaPublica('));
  assert.ok(f.includes(".eq('id', studioId)"));
});

test('catálogo público: con la página oculta y sin pase, sale antes de leer nada más', () => {
  const f = fuente('lib/db/supabase-data-admin.ts');
  const inicio = posicion(f, 'export async function fetchPublicStudioData(', 'supabase-data-admin');
  const cuerpo = f.slice(inicio, f.indexOf('\nexport ', inicio + 10));
  const gate = posicion(cuerpo, 'puertaPublica(', 'fetchPublicStudioData');
  assert.ok(gate < posicion(cuerpo, 'return catalogoPaginaOculta(', 'fetchPublicStudioData') + 1);
  for (const p of ['socioAutenticado(', 'conCacheCatalogo(', "from('sesiones')", "from('reservas')"])
    assert.ok(gate < posicion(cuerpo, p, 'fetchPublicStudioData'), `«${p}» va antes del gate`);
  // Y la ruta le pasa la cookie del estudio que resuelve.
  assert.ok(fuente('app/api/public/studio-data/route.ts').includes('paseAcceso: (studioId) => req.cookies.get(nombreCookieAcceso(studioId))?.value'));
});

test('el calendario incrustado pinta el aviso de la página, sin calendario ni enlace de reservar', () => {
  const hook = fuente('lib/widget/usar-datos-widget.ts');
  assert.ok(hook.includes('pub.paginaOculta === true'));
  const main = fuente('app/widget-bundle/main.tsx');
  const aviso = posicion(main, 'if (paginaOculta) {', 'main.tsx');
  const bloque = main.slice(aviso, main.indexOf('\n  }\n', aviso));
  assert.ok(bloque.includes('{AVISO_PAGINA_OCULTA}'));
  for (const no of ['ReservaCalendario', 'href', 'onReservar', 'Planes', 'Iniciar sesión'])
    assert.equal(bloque.includes(no), false, `el aviso del widget no puede llevar «${no}»`);
  assert.ok(aviso < posicion(main, '<ReservaCalendario', 'main.tsx'));
  // El mismo texto que la pantalla de /reservar y la app.
  assert.ok(fuente('components/publico/pagina-oculta.tsx').includes('{AVISO_PAGINA_OCULTA}'));
});
