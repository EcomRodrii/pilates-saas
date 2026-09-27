import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validarConsulta, enlaceRespuesta, CONSERVACION_MESES, LIMITES_CONSULTA } from './consulta.ts';

const base = {
  slug: 'estudio-alma', nombre: '  Ana   Pérez ', email: ' Ana@Example.com ', telefono: '+34 600 000 000',
  mensaje: ' ¿Tenéis clases para principiantes? ', aceptaPrivacidad: true, origen: 'web-contacto',
};

test('una consulta correcta sale limpia: espacios, email en minúsculas, teléfono y etiqueta', () => {
  const r = validarConsulta(base);
  assert.ok(r.ok);
  assert.deepEqual(r.consulta, {
    slug: 'estudio-alma', nombre: 'Ana Pérez', email: 'ana@example.com', telefono: '+34 600 000 000',
    mensaje: '¿Tenéis clases para principiantes?', origen: 'web-contacto',
  });
});

test('⚠️ sin aceptar la privacidad (o con algo que no es `true`) no se guarda', () => {
  for (const v of [false, 'true', 1, undefined, null]) {
    const r = validarConsulta({ ...base, aceptaPrivacidad: v });
    assert.equal(r.ok, false, String(v));
  }
});

test('faltan nombre, email válido o mensaje: error que dice qué corregir', () => {
  for (const cambio of [{ nombre: '  ' }, { email: 'no-es-email' }, { email: 'a@b' }, { mensaje: '' }, { slug: '' }]) {
    const r = validarConsulta({ ...base, ...cambio });
    assert.equal(r.ok, false, JSON.stringify(cambio));
  }
});

test('límites: nombre, email y mensaje demasiado largos se rechazan; justo en el límite pasa', () => {
  assert.equal(validarConsulta({ ...base, nombre: 'a'.repeat(LIMITES_CONSULTA.nombre + 1) }).ok, false);
  assert.equal(validarConsulta({ ...base, mensaje: 'a'.repeat(LIMITES_CONSULTA.mensaje + 1) }).ok, false);
  assert.equal(validarConsulta({ ...base, mensaje: 'a'.repeat(LIMITES_CONSULTA.mensaje) }).ok, true);
  assert.equal(validarConsulta({ ...base, email: `${'a'.repeat(200)}@example.com` }).ok, false);
});

test('el teléfono es opcional, pero si viene tiene que parecer un teléfono', () => {
  const sin = validarConsulta({ ...base, telefono: '' });
  assert.ok(sin.ok);
  assert.equal(sin.consulta.telefono, null);
  assert.equal(validarConsulta({ ...base, telefono: 'llámame' }).ok, false);
});

test('una etiqueta de origen que no cumple el formato se descarta, sin perder la consulta', () => {
  for (const origen of ['<script>', 'a'.repeat(41), 'con espacio']) {
    const r = validarConsulta({ ...base, origen });
    assert.ok(r.ok);
    assert.equal(r.consulta.origen, null);
  }
});

test('responder: mailto con el asunto y SIN el mensaje de la visitante en la URL', () => {
  const url = enlaceRespuesta('ana+yoga@example.com', 'Estudio Alma');
  assert.ok(url.startsWith('mailto:ana%2Byoga@example.com?subject='));
  assert.equal(decodeURIComponent(url.split('subject=')[1]), 'Re: tu consulta a Estudio Alma');
  assert.ok(!url.includes('body='));
});

// ── Lo que promete el formulario = lo que hace la base ───────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');
const migracion = readdirSync(MIGRACIONES).filter(n => n.endsWith('_consultas_contacto.sql'));

test('la tabla: RLS activa, sin política de INSERT, grants justos y la purga que promete el formulario', () => {
  assert.equal(migracion.length, 1, 'una sola migración crea consultas_contacto');
  const sql = readFileSync(join(MIGRACIONES, migracion[0]), 'utf8').replace(/--.*$/gm, '').toLowerCase();
  assert.ok(sql.includes('alter table public.consultas_contacto enable row level security'));
  assert.ok(!/create policy[^;]*on public\.consultas_contacto[^;]*for insert/.test(sql), 'nadie del cliente inserta: solo el endpoint con service-role');
  assert.ok(sql.includes('revoke all on table public.consultas_contacto from public, anon, authenticated'));
  assert.ok(sql.includes('grant update (estado, atendida_en, atendida_por) on table public.consultas_contacto to authenticated'));
  assert.ok(sql.includes('puede_gestionar_clientas()'), 'mismo trío que Clientas: INSTRUCTOR fuera');
  // «Como máximo N meses» en el formulario = el tope del pg_cron.
  assert.ok(sql.includes(`creada_en < now() - interval '${CONSERVACION_MESES * 30} days'`), 'el tope del cron no cuadra con CONSERVACION_MESES');
  assert.ok(sql.includes("'purgar-consultas-contacto'"));
});

test('⚠️ la purga de un estudio vencido borra sus consultas (la fila de studios no se borra: sin esto sobrevivirían)', () => {
  const todas = readdirSync(MIGRACIONES).filter(n => n.endsWith('.sql')).sort()
    .map(n => readFileSync(join(MIGRACIONES, n), 'utf8').replace(/--.*$/gm, '').toLowerCase());
  const ultima = todas.filter(s => /create or replace function public\.purgar_estudio_vencido\s*\(/.test(s)).at(-1)!;
  const cBorrar = ultima.match(/c_borrar constant text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? '';
  assert.ok(cBorrar.includes("'consultas_contacto'"));
});
