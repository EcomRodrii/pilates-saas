import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// La alumna deja su clase fija (antes «se habla con el estudio»). Estas funciones importan `@/`, así que se vigila el fuente:
// que la propiedad se compruebe en el servidor, que una clase fija con nombre se deje entera, y que no se diga que sí si no se pudo.

const raiz = join(import.meta.dirname, '..');
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');
const SERVIDOR = leer('lib/db/supabase-data-admin.ts');
const cuerpo = SERVIDOR.slice(SERVIDOR.indexOf('export async function dejarPlazaFijaAlumna'), SERVIDOR.indexOf('/** Solo las suyas, solo pendientes'));

test('⚠️ solo si el estudio deja gestionar las clases fijas desde la app, y la propiedad va en la lectura Y en la escritura', () => {
  assert.ok(cuerpo.length > 500, 'no se aisló la función');
  assert.match(cuerpo, /select\('plaza_fija_solicitar_desde_app'\)/);
  // La puerta del ajuste solo para una plaza SUELTA: las de clase fija con nombre se piden (y se dejan) aunque esté apagado.
  assert.match(cuerpo, /if \(!fila\.clase_fija_id && studio\?\.plaza_fija_solicitar_desde_app !== true\) \{\s+return \{ error: [^}]*status: 403/);
  // Lectura: socio_id de la sesión, nunca del body.
  assert.match(cuerpo, /\.eq\('id', p\.plazaId\)\.eq\('studio_id', p\.studioId\)\.eq\('socio_id', p\.socioId\)/);
  // Escritura: `aplicarEstadoPlazaFija` con el socio, que lo repite en el UPDATE.
  assert.match(cuerpo, /aplicarEstadoPlazaFija\(\s*admin, \{ studioId: p\.studioId, plazaId, estado: 'BAJA', socioId: p\.socioId \}/);
});

test('⚠️ una clase fija con nombre se deja ENTERA (todas sus plazas de ella), no un solo día', () => {
  assert.match(cuerpo, /if \(fila\.clase_fija_id\) \{/);
  assert.match(cuerpo, /\.eq\('socio_id', p\.socioId\)\.eq\('clase_fija_id', fila\.clase_fija_id as string\)/);
});

test('⚠️ no dice que sí si no se pudo dejar ninguna, y cuenta las que no', () => {
  assert.match(cuerpo, /if \(sinDejar === ids\.length\) return \{ error: [^}]*status: 500/);
  assert.match(cuerpo, /return \{ ok: true, plazas: ids\.length - sinDejar,/);
});

test('la ruta tiene la acción, con el límite de peticiones y sin más identidad que el JWT', () => {
  const ruta = leer('app/api/public/plaza-fija/route.ts');
  assert.match(ruta, /body\.accion === 'ampliar_clase_fija' \|\| body\.accion === 'dejar_plaza'\) \{/, 'lleva el límite corto de peticiones');
  const rama = ruta.slice(ruta.indexOf("if (body.accion === 'dejar_plaza') {"), ruta.indexOf("if (body.accion === 'cancelar_peticion') {"));
  assert.match(rama, /dejarPlazaFijaAlumna\(admin, \{ studioId: body\.studioId, socioId, plazaId \}\)/);
  assert.ok(!/body\.socioId/.test(rama), 'el socio sale del JWT');
});

test('el botón solo sale si el estudio lo permite y la plaza es suya (id), y el diálogo cuenta lo que pasa', () => {
  // «Mis clases → Fija» (rediseño del 5-oct-2026): la fila «Dejar mi clase fija» de `MiClaseFija`.
  const tarjeta = leer('components/student/domain/MiClaseFija.tsx');
  // El botón sale en la tarjeta; el diálogo (con su petición y su aviso) es UNA pieza que usan la tarjeta y el interruptor de «Auto reservable».
  const dialogo = leer('components/student/domain/DialogoDejarClaseFija.tsx');
  assert.match(tarjeta, /\(estudio\.puedePedirPlazaFija === true \|\| p\.deClaseFija\) && !!p\.id/);
  assert.match(tarjeta, /<DialogoDejarClaseFija plaza=\{dejando\}/, 'la tarjeta usa el diálogo compartido, no una copia');
  assert.match(dialogo, /dejarPlazaFija\(estudio\.slug, estudio\.id, plaza\.id\)/);
  assert.match(dialogo, /if \(!r\.ok\) \{[\s\S]*?setError\(r\.error\);[\s\S]*?return;/, 'si falla, la plaza SIGUE y el diálogo queda abierto');
  assert.match(dialogo, /plaza\.deClaseFija &&/, 'avisa de que deja todos los días solo cuando es de una clase fija con nombre');
  // El interruptor no se apaga hasta que el servidor dice que la dejó: lo apaga `onDejada` (con `trasDejarla`), que el diálogo solo
  // llama tras el `ok`.
  const auto = leer('components/student/domain/AutoReservable.tsx');
  assert.match(auto, /onDejada=\{\(\) => \{ if \(e\) cambio\(trasDejarla\(e\)\); \}\}/);
  assert.ok(dialogo.indexOf('onDejada?.()') > dialogo.indexOf('if (!r.ok)'), 'onDejada va después de comprobar el resultado');
});
