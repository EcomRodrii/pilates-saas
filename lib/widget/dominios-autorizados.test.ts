import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizarOrigenWidget, esOrigenWidgetValido, validarDominiosWidget, textoCambioDominios, MAX_DOMINIOS_WIDGET,
} from './dominios-autorizados.ts';

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');

test('normaliza lo que se teclea a un origen https', () => {
  assert.equal(normalizarOrigenWidget('midominio.com'), 'https://midominio.com');
  assert.equal(normalizarOrigenWidget('  https://MiDominio.com/  '), 'https://midominio.com');
  assert.equal(normalizarOrigenWidget('https://www.mi-dominio.es/reservas?x=1#a'), 'https://www.mi-dominio.es');
  assert.equal(normalizarOrigenWidget('https://midominio.com:443'), 'https://midominio.com');
  assert.equal(normalizarOrigenWidget('https://midominio.com:8443'), 'https://midominio.com:8443');
  assert.equal(normalizarOrigenWidget('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(normalizarOrigenWidget('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
});

test('rechaza comodines, http público, IPs, null y credenciales', () => {
  for (const malo of [
    '*', '*.midominio.com', 'https://*.midominio.com', 'null', 'http://midominio.com',
    'https://1.2.3.4', 'https://[::1]', 'https://intranet', 'https://usuario:clave@midominio.com',
    'ftp://midominio.com', 'javascript:alert(1)', 'https://mi dominio.com', 'https://-mal.com',
    'https://midominio.123', '', '   ', 42, null, undefined, 'a'.repeat(301),
  ]) {
    assert.equal(normalizarOrigenWidget(malo), null, String(malo));
  }
});

test('lo que se guarda tiene que llegar ya normalizado', () => {
  assert.equal(esOrigenWidgetValido('https://midominio.com'), true);
  assert.equal(esOrigenWidgetValido('https://midominio.com/'), false);
  assert.equal(esOrigenWidgetValido('midominio.com'), false);
  assert.equal(esOrigenWidgetValido('https://MIDOMINIO.com'), false);
  assert.equal(esOrigenWidgetValido('https://midominio.com/ruta'), false);
});

test('valida la lista entera, deduplica y pone tope', () => {
  assert.deepEqual(
    validarDominiosWidget({ dominios: ['https://a.com', 'https://b.es', 'https://a.com'] }),
    { ok: true, dominios: ['https://a.com', 'https://b.es'] },
  );
  assert.deepEqual(validarDominiosWidget({ dominios: [] }), { ok: true, dominios: [] });
  assert.equal(validarDominiosWidget(null).ok, false);
  assert.equal(validarDominiosWidget({ dominios: 'https://a.com' }).ok, false);
  assert.equal(validarDominiosWidget({ dominios: ['https://a.com', '*'] }).ok, false);
  const demasiados = Array.from({ length: MAX_DOMINIOS_WIDGET + 1 }, (_, i) => `https://d${i}.com`);
  assert.equal(validarDominiosWidget({ dominios: demasiados }).ok, false);
});

test('la línea de Actividad dice qué se autorizó y qué se retiró', () => {
  assert.equal(textoCambioDominios(['https://a.com'], ['https://a.com']), null);
  assert.equal(
    textoCambioDominios(['https://a.com'], ['https://b.com']),
    'Dominios del widget: autorizado https://b.com; retirado https://a.com',
  );
});

// ── Contrato con el código y la migración ────────────────────────────────────

test('el navegador ya no escribe los dominios del widget', () => {
  const datos = leer('lib/supabase-data.ts');
  assert.doesNotMatch(datos, /db\.widget_dominios_autorizados\s*=/);
  assert.doesNotMatch(leer('components/configuracion/tab-api.tsx'), /updateStudio\(\{\s*widgetDominiosAutorizados/);

  const ruta = leer('app/api/estudio/widget-dominios/route.ts');
  assert.match(ruta, /verificarSesionStaff\(req\)/);
  assert.match(ruta, /sesion\.rol !== 'PROPIETARIO'/);
  assert.match(ruta, /sesion\.studioId/);
  assert.match(ruta, /validarDominiosWidget\(/);
  assert.match(ruta, /actividad_reciente/);

  const sql = leer('supabase/migrations/20260914110200_widget_dominios_solo_servidor.sql');
  assert.match(sql, /revoke\s+update\s*\(\s*widget_dominios_autorizados\s*\)\s+on\s+public\.studios\s+from\s+authenticated/i);
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.studios_widget_dominios_solo_servidor\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
});
