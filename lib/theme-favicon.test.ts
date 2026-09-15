import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAVICON_URL_MAX, esFaviconDelEstudio, faviconConFormaValida } from './theme-favicon.ts';

const BASE = 'https://proyecto.supabase.co';
const PUBLICO = `${BASE}/storage/v1/object/public/avatars`;

test('forma: solo https, sin credenciales y acotada', () => {
  assert.equal(faviconConFormaValida('https://cdn.example.com/f.ico'), true);
  for (const mala of [
    'http://cdn.example.com/f.ico',
    'ftp://cdn.example.com/f.ico',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'no es una url',
    '',
    'https://usuario:clave@cdn.example.com/f.ico',
  ]) {
    assert.equal(faviconConFormaValida(mala), false, mala);
  }
  const larga = `https://cdn.example.com/${'a'.repeat(FAVICON_URL_MAX)}`;
  assert.equal(faviconConFormaValida(larga), false, 'pasa del tope');
});

test('del estudio: sus tres ficheros de marca en nuestro Storage, con o sin cache-bust', () => {
  assert.equal(esFaviconDelEstudio(`${PUBLICO}/favicon-s1?v=1726400000000`, 's1', BASE), true);
  assert.equal(esFaviconDelEstudio(`${PUBLICO}/favicon-borrador-s1?v=1`, 's1', BASE), true);
  assert.equal(esFaviconDelEstudio(`${PUBLICO}/logo-s1`, 's1', BASE), true, 'el logo que pone la bienvenida');
  assert.equal(esFaviconDelEstudio(`${PUBLICO}/favicon-s1`, 's1', `${BASE}/`), true, 'base con barra final');
});

test('del estudio: nada fuera de su sitio exacto', () => {
  const casos: [string, string][] = [
    [`${PUBLICO}/favicon-s2`, 'de otro estudio'],
    [`${PUBLICO}/favicon-s1-otra`, 'sufijo añadido'],
    [`${PUBLICO}/portal-s1-banner`, 'otra pieza del estudio'],
    [`${BASE}/storage/v1/object/public/otro-bucket/favicon-s1`, 'otro bucket'],
    [`${PUBLICO}/favicon-s1/../favicon-s2`, 'ruta con ..'],
    [`${PUBLICO}/favicon%2Ds1`, 'ruta codificada'],
    [`${PUBLICO}/favicon-s1#x`, 'con fragmento'],
    ['https://proyecto.supabase.co.otro.com/storage/v1/object/public/avatars/favicon-s1', 'host que empieza igual'],
    ['https://otro.supabase.co/storage/v1/object/public/avatars/favicon-s1', 'otro proyecto'],
    [`https://proyecto.supabase.co:8443/storage/v1/object/public/avatars/favicon-s1`, 'otro puerto'],
    [`http://proyecto.supabase.co/storage/v1/object/public/avatars/favicon-s1`, 'http'],
    ['https://cdn.example.com/favicon.png', 'un enlace de fuera'],
  ];
  for (const [url, motivo] of casos) assert.equal(esFaviconDelEstudio(url, 's1', BASE), false, motivo);
});

test('del estudio: sin base de Supabase o sin estudio, no se da nada por bueno', () => {
  assert.equal(esFaviconDelEstudio(`${PUBLICO}/favicon-s1`, 's1', null), false);
  assert.equal(esFaviconDelEstudio(`${PUBLICO}/favicon-s1`, 's1', ''), false);
  assert.equal(esFaviconDelEstudio(`${PUBLICO}/favicon-`, '', BASE), false);
});
