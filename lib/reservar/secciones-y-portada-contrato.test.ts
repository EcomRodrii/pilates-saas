import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// /reservar decide qué secciones pinta con `bloquesReservar` y los textos de su
// portada con `reservar*` (del tema), y pide `studio-data` en modo `liviano`.
// Mientras ese modo se saltaba el tema y la disposición, la página pública salía
// en producción sin portada, sin bonos, sin «sobre» y sin contacto (30-sep-2026)
// — y ningún e2e lo vio, porque sus mocks no traen el campo y el cliente cae al
// orden por defecto.

const fuente = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');

test('studio-data trae el tema y los bloques también en modo liviano', () => {
  const admin = fuente('lib/db/supabase-data-admin.ts');
  assert.doesNotMatch(admin, /liviano\s*\?\s*null\s*:\s*await\s+getLayout/, 'la disposición de bloques no puede depender de `liviano`');
  assert.doesNotMatch(admin, /liviano\s*\?\s*null\s*:\s*await\s+getThemePublicado/, 'el tema no puede depender de `liviano`');
  assert.match(admin, /Promise\.all\(\[getThemePublicado\(studioId\), getLayout\(studioId\)\]\)/);
});

test('la portada y la ficha para Google no usan la foto de perfil de la propietaria', () => {
  const pagina = fuente('app/reservar/[slug]/page.tsx');
  const heroe = pagina.match(/const heroFoto = [^;]+;/)?.[0] ?? '';
  assert.ok(heroe, 'no se encuentra heroFoto');
  assert.doesNotMatch(heroe, /fotoUrl/, '`studios.foto_url` es la foto de perfil de la propietaria, no la del estudio');
  assert.match(heroe, /imagenBienvenidaUrl/);
  const layout = fuente('app/reservar/[slug]/layout.tsx');
  assert.doesNotMatch(layout, /imagenUrl:\s*studio\.fotoUrl/);
});
