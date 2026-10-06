import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefijoFotoComunidad, rutaFotoComunidad } from './foto.ts';

const SUPABASE = 'https://proyecto.supabase.co';
const PREFIJO = 'https://proyecto.supabase.co/storage/v1/object/public/comunidad-media/';

test('una foto de este estudio en comunidad-media da su ruta en el bucket', () => {
  assert.equal(prefijoFotoComunidad(`${SUPABASE}/`), PREFIJO);
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1/post-1700000000000`, 'studio-1', SUPABASE), 'studio-1/post-1700000000000');
});

test('la foto de OTRO estudio no se toca', () => {
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-2/post-1`, 'studio-1', SUPABASE), null);
  // Ni un estudio cuyo id empieza igual.
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-10/post-1`, 'studio-1', SUPABASE), null);
});

test('otro bucket del mismo proyecto, no', () => {
  assert.equal(rutaFotoComunidad(`${SUPABASE}/storage/v1/object/public/avatars/studio-1/x`, 'studio-1', SUPABASE), null);
  assert.equal(rutaFotoComunidad(`${SUPABASE}/storage/v1/object/public/documentos-socio/studio-1/x`, 'studio-1', SUPABASE), null);
});

test('un dominio ajeno que contiene /comunidad-media/, no', () => {
  assert.equal(rutaFotoComunidad('https://rastreo.ajeno.example/comunidad-media/studio-1/x.png', 'studio-1', SUPABASE), null);
  assert.equal(rutaFotoComunidad(`https://ajeno.example/?u=${PREFIJO}studio-1/x`, 'studio-1', SUPABASE), null);
});

test('una ruta con .. (también codificada) o vacía, no', () => {
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1/../studio-2/x`, 'studio-1', SUPABASE), null);
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1/%2E%2E/studio-2/x`, 'studio-1', SUPABASE), null);
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1/`, 'studio-1', SUPABASE), null);
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1//x`, 'studio-1', SUPABASE), null);
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1/%E0%A4%A`, 'studio-1', SUPABASE), null, 'codificación rota');
});

test('se quita la query y se decodifican los espacios', () => {
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1/foto%20de%20clase.webp?t=123#x`, 'studio-1', SUPABASE), 'studio-1/foto de clase.webp');
});

test('sin URL, sin estudio o sin proyecto configurado: null', () => {
  assert.equal(rutaFotoComunidad(null, 'studio-1', SUPABASE), null);
  assert.equal(rutaFotoComunidad(undefined, 'studio-1', SUPABASE), null);
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1/x`, '', SUPABASE), null);
  assert.equal(rutaFotoComunidad(`${PREFIJO}studio-1/x`, 'studio-1', ''), null);
});
