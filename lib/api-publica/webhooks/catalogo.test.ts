import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RECURSOS_EVENTO, SCOPE_DE_RECURSO, TABLA_DE_RECURSO, TIPOS_CONTABILIDAD, TIPOS_EVENTO,
  esTipoEvento, scopeDeTipo, tiposPermitidos,
} from './catalogo.ts';
import { COLUMNAS } from '../serializar.ts';

// El catálogo vive en tres sitios que tienen que decir lo mismo: esta lista, la
// migración (CHECK de los tipos y columnas que vigila el trigger) y COLUMNAS.
// Si se separan, o el trigger registra un tipo que nadie puede suscribir, o
// cambia una columna que la API enseña y no avisa nadie.

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const MIGRACION = readFileSync(join(RAIZ, 'supabase/migrations/20261001162731_api_webhooks.sql'), 'utf8');

test('cada tipo cumple el CHECK de api_eventos.tipo', () => {
  const m = /tipo\s+text not null check \(tipo ~ '([^']+)'\)/.exec(MIGRACION);
  assert.ok(m, 'no encuentro el CHECK de api_eventos.tipo');
  const re = new RegExp(m![1]);
  for (const t of TIPOS_EVENTO) assert.match(t, re);
  assert.doesNotMatch('recibo.creada', re);
  assert.doesNotMatch('clienta.creado', re);
});

test('api_webhooks.tipos admite exactamente el catálogo', () => {
  const m = /tipos <@ array\[([\s\S]*?)\]::text\[\]/.exec(MIGRACION);
  assert.ok(m);
  const enSql = [...m![1].matchAll(/'([a-z.]+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(enSql, [...TIPOS_EVENTO].sort());
});

test('el trigger vigila exactamente las columnas que la API enseña', () => {
  const columnasDe = (lista: string) => lista.replace(/\w+\([^)]*\)/g, '').split(',').map((c) => c.trim()).filter((c) => c && c !== 'id');
  const esperadas: Record<string, string[]> = {
    recibos: columnasDe(COLUMNAS.recibo),
    facturas: columnasDe(COLUMNAS.factura),
    devoluciones: columnasDe(COLUMNAS.devolucion),
    ventas_pos: columnasDe(COLUMNAS.venta),
    socios: columnasDe(COLUMNAS.clientaFiscal),
  };
  for (const [tabla, cols] of Object.entries(esperadas)) {
    const m = new RegExp(`when '${tabla}' then array\\[([\\s\\S]*?)\\]`).exec(MIGRACION.slice(MIGRACION.indexOf('if tg_op = \'UPDATE\'')));
    assert.ok(m, `el trigger no vigila ${tabla}`);
    const enSql = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    assert.deepEqual(enSql, [...cols].sort(), `${tabla}: el trigger y COLUMNAS no coinciden`);
  }
});

test('hay un trigger en cada tabla del catálogo, y el nombre del recurso cuadra', () => {
  for (const r of RECURSOS_EVENTO) {
    const tabla = TABLA_DE_RECURSO[r];
    assert.match(MIGRACION, new RegExp(`create trigger trg_api_evento after insert or update or delete on public\\.${tabla}\\b`));
    assert.match(MIGRACION, new RegExp(`when '${tabla}' then '${r}'`));
  }
});

test('el permiso de cada evento es el mismo que para leer el recurso', () => {
  assert.equal(scopeDeTipo('recibo.actualizado'), 'pagos:leer');
  assert.equal(scopeDeTipo('venta.creada'), 'pagos:leer');
  assert.equal(scopeDeTipo('devolucion.creada'), 'pagos:leer');
  assert.equal(scopeDeTipo('factura.creada'), 'facturas:leer');
  assert.equal(scopeDeTipo('clienta.actualizada'), 'clientas:leer');
  assert.deepEqual(Object.keys(SCOPE_DE_RECURSO).sort(), [...RECURSOS_EVENTO].sort());
});

test('tiposPermitidos: sin pagos:leer no se ve ningún evento de dinero', () => {
  const t = tiposPermitidos(['clientas:leer', 'facturas:leer']);
  assert.ok(t.every((x) => x.startsWith('clienta.') || x.startsWith('factura.')));
  assert.equal(tiposPermitidos([]).length, 0);
  assert.equal(tiposPermitidos(['pagos:leer', 'facturas:leer', 'clientas:leer']).length, TIPOS_EVENTO.length);
});

test('esTipoEvento y la propuesta de contabilidad', () => {
  assert.ok(esTipoEvento('recibo.creado'));
  assert.ok(!esTipoEvento('webhook.prueba'));
  assert.ok(!esTipoEvento(42));
  assert.ok(TIPOS_CONTABILIDAD.length > 0 && TIPOS_CONTABILIDAD.every((t) => !t.startsWith('clienta.')));
});

// ── Lo que encontró la revisión de seguridad (1-oct-2026) ────────────────────

test('suprimir o borrar a una clienta vacía sus copias en el registro y descarta lo pendiente', () => {
  assert.match(MIGRACION, /create trigger trg_api_eventos_olvidar after update or delete on public\.socios/);
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('function public.api_eventos_olvidar_clienta'), MIGRACION.indexOf('revoke all on function public.api_eventos_olvidar_clienta'));
  // La señal de supresión: lo que deja anonimizar_socio.
  assert.match(cuerpo, /old\.borrado_en is null and new\.borrado_en is not null/);
  assert.match(cuerpo, /borrado\+%@anon\.invalid/);
  assert.match(cuerpo, /set datos = null[\s\S]*e\.recurso = 'clienta' and e\.recurso_id = old\.id and e\.studio_id = old\.studio_id/);
  assert.match(cuerpo, /set estado = 'DESCARTADA'/);
});

test('reparto justo: ningún estudio ni webhook acapara una pasada del trabajador', () => {
  assert.match(MIGRACION, /row_number\(\) over \(partition by x\.studio_id order by x\.seq\)/);
  assert.match(MIGRACION, /row_number\(\) over \(partition by x\.webhook_id order by x\.proximo_intento_en, x\.creada_en\)/);
});

test('el registro no puede saltarse un evento: `publicado` se reparte bajo cerrojo hasta el commit', () => {
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('function public.api_eventos_guardar'), MIGRACION.indexOf('function public.api_webhooks_reclamar_entregas'));
  assert.match(cuerpo, /pg_advisory_xact_lock\(/);
  assert.match(cuerpo, /nextval\('public\.api_eventos_publicacion_seq'\)/);
  const ruta = readFileSync(join(RAIZ, 'app/api/v1/eventos/route.ts'), 'utf8');
  assert.match(ruta, /\.gt\('publicado', despues\)/);
  assert.match(ruta, /\.order\('publicado', \{ ascending: true \}\)/);
  assert.doesNotMatch(ruta, /\.gt\('seq'/, 'el cursor sobre `seq` se salta eventos de transacciones largas');
});

test('las secuencias nuevas no quedan al alcance de anon/authenticated', () => {
  assert.match(MIGRACION, /revoke all on sequence %s from public, anon, authenticated', pg_get_serial_sequence\('public\.api_eventos', 'seq'\)/);
  assert.match(MIGRACION, /revoke all on sequence public\.api_eventos_publicacion_seq from public, anon, authenticated/);
  assert.match(MIGRACION, /has_sequence_privilege\(v_rol, v_tab, 'USAGE'\)/);
});
