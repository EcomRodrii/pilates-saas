import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LOGOS, hostDeSupabase, logoUrlValida, seleccionarLogos, usaMarquesina, type FilaLogoEstudio,
} from './logos-clientes.ts';
import { logosDePrueba } from './logos-clientes-prueba.ts';

const HOST = 'proyecto-ejemplo.supabase.co';
const URL_BUENA = `https://${HOST}/storage/v1/object/public/avatars/logo-studio-ejemplo?v=1`;

function fila(extra: Partial<FilaLogoEstudio> = {}): FilaLogoEstudio {
  return {
    nombre: 'Estudio Ejemplo', logo_url: URL_BUENA, es_demo: false, subscription_status: 'active',
    mostrar_logo_en_landing: true, creado_en: '2026-01-01T00:00:00Z', ...extra,
  };
}

test('control: una fila con consentimiento, no demo, suscripción viva y logo nuestro sale', () => {
  assert.deepEqual(seleccionarLogos([fila()], HOST), [{ nombre: 'Estudio Ejemplo', logoUrl: URL_BUENA }]);
});

test('sin consentimiento (apagado o sin dato) no sale, aunque tenga logo y pague', () => {
  assert.deepEqual(seleccionarLogos([fila({ mostrar_logo_en_landing: false })], HOST), []);
  assert.deepEqual(seleccionarLogos([fila({ mostrar_logo_en_landing: null })], HOST), []);
});

test('un estudio demo no sale aunque tenga el consentimiento puesto', () => {
  assert.deepEqual(seleccionarLogos([fila({ es_demo: true })], HOST), []);
  assert.deepEqual(seleccionarLogos([fila({ es_demo: null })], HOST), [], 'sin dato de demo, por prudencia no sale');
});

test('sin logo (null, vacío o en blanco) no sale', () => {
  for (const logo_url of [null, '', '   ']) {
    assert.deepEqual(seleccionarLogos([fila({ logo_url })], HOST), [], `logo_url=${JSON.stringify(logo_url)}`);
  }
});

test('la suscripción tiene que estar viva: active, trialing o gratis', () => {
  for (const s of ['active', 'trialing', 'gratis']) {
    assert.equal(seleccionarLogos([fila({ subscription_status: s })], HOST).length, 1, s);
  }
  for (const s of ['canceled', 'trial_expirado', 'past_due', 'unpaid', null]) {
    assert.deepEqual(seleccionarLogos([fila({ subscription_status: s })], HOST), [], String(s));
  }
});

test('un logo de otro host, http, de otro bucket o con credenciales no se pinta', () => {
  const malas = [
    'https://otro-host.example.com/storage/v1/object/public/avatars/logo.png',
    `http://${HOST}/storage/v1/object/public/avatars/logo.png`,
    `https://${HOST}/storage/v1/object/public/otro-bucket/logo.png`,
    `https://${HOST}/storage/v1/object/public/avatars/`,
    `https://usuario:clave@${HOST}/storage/v1/object/public/avatars/logo.png`,
    `https://${HOST}.evil.example.com/storage/v1/object/public/avatars/logo.png`,
    `https://${HOST}:8443/storage/v1/object/public/avatars/logo.png`,
    'javascript:alert(1)',
    'data:image/svg+xml;utf8,<svg/>',
    '/storage/v1/object/public/avatars/logo.png',
    'no es una url',
  ];
  for (const logo_url of malas) {
    assert.equal(logoUrlValida(logo_url, HOST), false, logo_url);
    assert.deepEqual(seleccionarLogos([fila({ logo_url })], HOST), [], logo_url);
  }
  assert.equal(logoUrlValida(URL_BUENA, HOST), true, 'control');
});

test('sin host de Supabase configurado no se pinta ningún logo', () => {
  assert.deepEqual(seleccionarLogos([fila()], null), []);
  assert.equal(hostDeSupabase(undefined), null);
  assert.equal(hostDeSupabase('http://proyecto-ejemplo.supabase.co'), null, 'http no vale');
  assert.equal(hostDeSupabase('esto no es una url'), null);
  assert.equal(hostDeSupabase(`https://${HOST}`), HOST, 'control');
});

test('tope de 12: de 20 filas buenas salen 12, las más antiguas', () => {
  const filas = Array.from({ length: 20 }, (_, i) => fila({
    nombre: `Estudio ${String(i).padStart(2, '0')}`,
    logo_url: `https://${HOST}/storage/v1/object/public/avatars/logo-${i}`,
    creado_en: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  })).reverse();
  const sel = seleccionarLogos(filas, HOST);
  assert.equal(MAX_LOGOS, 12);
  assert.equal(sel.length, 12);
  assert.equal(sel[0].nombre, 'Estudio 00');
  assert.equal(sel[11].nombre, 'Estudio 11');
});

test('una fila inválida no gasta uno de los doce huecos', () => {
  const buenas = Array.from({ length: 12 }, (_, i) => fila({
    nombre: `Bueno ${i}`, logo_url: `https://${HOST}/storage/v1/object/public/avatars/b-${i}`,
    creado_en: new Date(Date.UTC(2026, 5, 1 + i)).toISOString(),
  }));
  const malas = Array.from({ length: 5 }, (_, i) => fila({
    nombre: `Malo ${i}`, es_demo: true, creado_en: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(),
  }));
  const sel = seleccionarLogos([...malas, ...buenas], HOST);
  assert.equal(sel.length, 12);
  assert.ok(sel.every((l) => l.nombre.startsWith('Bueno')));
});

test('ordena por antigüedad, dedupe el mismo archivo y descarta nombres vacíos', () => {
  const sel = seleccionarLogos([
    fila({ nombre: 'Nuevo', logo_url: `https://${HOST}/storage/v1/object/public/avatars/n`, creado_en: '2026-09-01T00:00:00Z' }),
    fila({ nombre: 'Antiguo', logo_url: `https://${HOST}/storage/v1/object/public/avatars/a`, creado_en: '2025-01-01T00:00:00Z' }),
    fila({ nombre: 'Antiguo repetido', logo_url: `https://${HOST}/storage/v1/object/public/avatars/a`, creado_en: '2026-02-01T00:00:00Z' }),
    fila({ nombre: '   ', logo_url: `https://${HOST}/storage/v1/object/public/avatars/v` }),
    fila({ nombre: null, logo_url: `https://${HOST}/storage/v1/object/public/avatars/w` }),
  ], HOST);
  assert.deepEqual(sel.map((l) => l.nombre), ['Antiguo', 'Nuevo']);
});

test('vacío = lista vacía (sin franja)', () => {
  assert.deepEqual(seleccionarLogos([], HOST), []);
});

test('marquesina desde 7 logos; con menos, fila', () => {
  assert.equal(usaMarquesina(0), false);
  assert.equal(usaMarquesina(1), true);
  assert.equal(usaMarquesina(5), true);
  assert.equal(usaMarquesina(7), true);
  assert.equal(usaMarquesina(12), true);
});

test('los logos de prueba son inventados: nombres ficticios, SVG en línea y nunca una URL real', () => {
  const l = logosDePrueba(8);
  assert.equal(l.length, 8);
  assert.equal(new Set(l.map((x) => x.nombre)).size, 8);
  assert.ok(l.every((x) => x.logoUrl.startsWith('data:image/svg+xml')));
  assert.equal(logosDePrueba(0).length, 0);
  assert.equal(logosDePrueba(99).length, 12);
  assert.equal(logosDePrueba(Number.NaN).length, 0);
});
