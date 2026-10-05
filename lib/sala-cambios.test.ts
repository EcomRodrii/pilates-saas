import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fotoSalaParaGuardar, salaCambiosToDb } from './sala-cambios.ts';

test('la imagen de la sala se escribe al editar, y vaciarla la quita', () => {
  assert.deepEqual(salaCambiosToDb({ fotoUrl: ' https://x.invalid/sala.webp ' }), { foto_url: 'https://x.invalid/sala.webp' });
  assert.deepEqual(salaCambiosToDb({ fotoUrl: '   ' }), { foto_url: null });
  assert.deepEqual(salaCambiosToDb({ fotoUrl: null }), { foto_url: null });
});

test('solo se escribe lo que cambia', () => {
  assert.deepEqual(salaCambiosToDb({ nombre: 'Sala Sol' }), { nombre: 'Sala Sol' });
  assert.deepEqual(salaCambiosToDb({ capacidad: 8, color: '#000' }), { capacidad: 8, color: '#000' });
  assert.equal(fotoSalaParaGuardar(undefined), null);
});

test('crear y editar una sala pasan por aquí: ninguna se queda sin escribir la imagen', () => {
  const fuente = readFileSync(new URL('./supabase-data.ts', import.meta.url), 'utf8');
  const crear = fuente.slice(fuente.indexOf('function salaToDb('), fuente.indexOf('export async function dbInsertSala('));
  assert.match(crear, /foto_url:\s*fotoSalaParaGuardar\(s\.fotoUrl\)/, 'salaToDb tiene que escribir foto_url');
  const editar = fuente.slice(fuente.indexOf('export async function dbUpdateSala('), fuente.indexOf('const SIN_PERMISO_SALAS'));
  assert.match(editar, /salaCambiosToDb\(changes\)/, 'dbUpdateSala tiene que usar salaCambiosToDb');
});
