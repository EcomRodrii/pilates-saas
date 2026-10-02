import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COLUMNAS_RECIBO_ACTUALIZABLES, COLUMNAS_RECIBO_INSERTABLES } from './recibo-escritura-navegador.ts';
import { esReciboCobrable } from '../billing/deuda-recibo.ts';
import { COLUMNAS_COBRO_EN_MARCHA } from '../billing/remesa-sepa-reglas.ts';

// El navegador escribe SOLO las columnas de `recibos` que necesita (migración
// 20261002094636). La cerradura real es la base de datos (REVOKE de tabla + GRANT por columnas); este
// fichero fija que el CÓDIGO, la lista que lo declara y la migración dicen lo mismo, y que ningún otro
// escritor del navegador se cuela. Lo que hace la base de datos de verdad se prueba en
// `supabase/tests/rls-recibos-columnas-escribibles.test.ts` (CI, contra Postgres).

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function migracion(): string {
  const dir = join(raiz, 'supabase', 'migrations');
  const nombre = readdirSync(dir).find(n => n.endsWith('_recibos_columnas_escribibles.sql'));
  assert.ok(nombre, 'no existe la migración de columnas escribibles de recibos');
  return readFileSync(join(dir, nombre), 'utf8').replace(/^\s*--.*$/gm, '');
}

const columnasDel = (sql: string, privilegio: 'insert' | 'update'): string[] => {
  const m = sql.match(new RegExp(`grant ${privilegio} \\(([^)]+)\\)\\s+on public\\.recibos to authenticated`));
  assert.ok(m, `la migración no concede ${privilegio} por columnas a authenticated`);
  return m[1].split(',').map(c => c.trim()).sort();
};

test('la migración concede a authenticated exactamente las columnas de la lista, tras quitarle las de tabla', () => {
  const sql = migracion();
  // Orden que funciona: REVOKE de tabla y GRANT por columnas (un REVOKE de columna no resta de un grant de tabla).
  const revoke = sql.indexOf('revoke insert, update on public.recibos from authenticated');
  assert.ok(revoke >= 0, 'la migración no quita el INSERT/UPDATE de tabla a authenticated');
  assert.ok(revoke < sql.indexOf('grant insert ('), 'el GRANT por columnas va DESPUÉS del REVOKE de tabla');
  assert.deepEqual(columnasDel(sql, 'insert'), [...COLUMNAS_RECIBO_INSERTABLES].sort(), 'GRANT INSERT y COLUMNAS_RECIBO_INSERTABLES divergen');
  assert.deepEqual(columnasDel(sql, 'update'), [...COLUMNAS_RECIBO_ACTUALIZABLES].sort(), 'GRANT UPDATE y COLUMNAS_RECIBO_ACTUALIZABLES divergen');
  // Nada que le dé escritura a anon o a PUBLIC.
  assert.doesNotMatch(sql, /to (public|anon)\b/i);
});

test('la política de cancelar una cuota corre como su dueño: escribe columnas que el navegador ya no tiene', () => {
  const sql = migracion();
  assert.match(sql, /alter function public\.aplicar_politica_recibos_al_cancelar_cuota\(\) security definer;/);
  // Y verifica el resultado: DEFINER con `search_path` fijo y sin EXECUTE para anon/authenticated.
  assert.match(sql, /p\.prosecdef/);
  assert.match(sql, /has_function_privilege\('authenticated', 'public\.aplicar_politica_recibos_al_cancelar_cuota\(\)'::regprocedure, 'EXECUTE'\)/);
});

test('el trigger cierra también DEVUELTO: nacer, pasar y salir (solo «Reintentar» de uno devuelto por el banco)', () => {
  const sql = migracion();
  const fn = sql.slice(sql.indexOf('create or replace function public.recibos_cobrado_solo_servidor()'));
  assert.match(fn, /security invoker\s+set search_path = ''/);
  assert.match(fn, /if public\.es_llamada_servicio\(\) then\s+return new;/);
  assert.match(fn, /new\.estado = 'DEVUELTO' then\s+raise exception 'recibos_cobrado_solo_servidor: un recibo no puede crearse ya devuelto/);
  assert.match(fn, /if new\.estado = 'DEVUELTO' then\s+raise exception 'recibos_cobrado_solo_servidor: el estado devuelto/);
  // Salir de DEVUELTO: solo a EN_CURSO y solo si lo devolvió el banco — el criterio de `esReciboCobrable`.
  assert.match(fn, /old\.estado = 'DEVUELTO'\s+and not \(new\.estado = 'EN_CURSO'\s+and old\.reembolso_stripe_id is null\s+and old\.reembolso_solicitado_en is null\s+and coalesce\(old\.importe_devuelto, 0\) < old\.importe\)/);
  // El dinero de un cobrado o devuelto: las ocho columnas.
  for (const col of ['importe', 'metodo_cobro', 'fecha_cobro', 'fecha_devolucion', 'importe_devuelto', 'reembolso_stripe_id', 'reembolso_solicitado_en', 'stripe_payment_intent_id']) {
    assert.match(fn, new RegExp(`new\\.${col} is distinct from old\\.${col}`), `un recibo cobrado/devuelto podría cambiar ${col}`);
  }
  assert.match(fn, /old\.estado in \('COBRADO', 'DEVUELTO'\)/);
  // Un recibo NACE pendiente desde el navegador (FALLIDO alimenta el bloqueo por impago, EN_CURSO simula «enviado al banco»).
  assert.match(fn, /if new\.estado is distinct from 'PENDIENTE' then\s+raise exception 'recibos_cobrado_solo_servidor: un recibo nace pendiente/);
  // Un EN_CURSO con un cobro en vuelo no vuelve a pendiente a mano: las cuatro columnas de `COLUMNAS_COBRO_EN_MARCHA`.
  assert.match(fn, /old\.estado = 'EN_CURSO'\s+and new\.estado in \('PENDIENTE', 'FALLIDO'\)/);
  for (const col of ['stripe_payment_intent_id', 'checkout_session_id', 'cobro_mostrador_pi', 'proximo_reintento']) {
    assert.match(fn, new RegExp(`old\\.${col} is not null`), `un EN_CURSO con ${col} podría volver a pendiente`);
  }
  assert.deepEqual([...COLUMNAS_COBRO_EN_MARCHA].sort(), ['checkout_session_id', 'cobro_mostrador_pi', 'proximo_reintento', 'stripe_payment_intent_id'],
    'la pantalla y el trigger tienen que mirar las mismas columnas de «cobro en marcha»');
  // Todos los rechazos son 42501 y llevan el nombre del trigger delante (`lib/errores.ts` los reconoce por él).
  const rechazos = (fn.match(/raise exception 'recibos_cobrado_solo_servidor: /g) ?? []).length;
  assert.equal(rechazos, 8);
  assert.equal((fn.match(/errcode = '42501'/g) ?? []).length, rechazos);
  assert.match(sql, /revoke all on function public\.recibos_cobrado_solo_servidor\(\) from public, anon, authenticated;/);
});

test('«devuelto por el banco» en SQL dice lo mismo que `esReciboCobrable` en TypeScript', () => {
  // La migración abre «Reintentar» solo si: sin reembolso pedido ni hecho y sin importe devuelto entero.
  // `esReciboCobrable` es el criterio de pantalla y de cobro: si divergieran, la pantalla ofrecería un botón
  // que la base de datos rechaza (o al revés, un reembolso se podría reabrir).
  const devuelto = (extra: Record<string, unknown>) => ({ estado: 'DEVUELTO', importe: 10, importe_devuelto: 0, ...extra });
  assert.equal(esReciboCobrable(devuelto({})), true, 'devuelto por el banco: se reintenta');
  assert.equal(esReciboCobrable(devuelto({ reembolso_stripe_id: 're_x' })), false);
  assert.equal(esReciboCobrable(devuelto({ reembolso_solicitado_en: '2026-10-01T10:00:00Z' })), false);
  assert.equal(esReciboCobrable(devuelto({ importe_devuelto: 10 })), false);
  assert.equal(esReciboCobrable(devuelto({ importe_devuelto: 4 })), true, 'devuelto parcial: aún se debe algo');
  // Y la migración usa exactamente esas tres columnas.
  const fuente = leer('lib/billing/deuda-recibo.ts');
  for (const col of ['reembolso_stripe_id', 'reembolso_solicitado_en', 'importe_devuelto']) assert.ok(fuente.includes(col));
});

test('los mapeadores del navegador están atados a las listas por tipo, y ningún otro escribe recibos con la sesión del usuario', () => {
  const datos = sinComentarios(leer('lib/supabase-data.ts'));
  assert.match(datos, /function reciboNuevoToDb\(rec: ReciboNuevo\): Record<ColumnaReciboInsertable, unknown>/);
  assert.match(datos, /function cambiosReciboToDb\(changes: CambiosRecibo\): Partial<Record<ColumnaReciboActualizable, unknown>>/);
  // dbUpdateRecibo y dbUpdateRecibosBatch pasan por el mapeador estrecho, no por un `db` armado a mano.
  for (const f of ['export async function dbUpdateRecibo(', 'export async function dbUpdateRecibosBatch(']) {
    const i = datos.indexOf(f);
    assert.ok(i >= 0, f);
    assert.match(datos.slice(i, i + 1600), /cambiosReciboToDb\(changes\)/, `${f} no usa el mapeador estrecho`);
  }
  // Los tres guardas de «el navegador dice no antes de ir a la red» cubren COBRADO y DEVUELTO.
  assert.equal((datos.match(/=== 'COBRADO' \|\| (rec|changes)\.estado === 'DEVUELTO'/g) ?? []).length, 3);

  // Ningún otro fichero que use el cliente del NAVEGADOR escribe `recibos` (los del servidor usan el admin).
  const escribe = /from\(['"]recibos['"]\)[^;]{0,400}?\.(insert|update|upsert|delete)\(/s;
  const infractores: string[] = [];
  const recorrer = (dir: string) => {
    for (const ent of readdirSync(join(raiz, dir), { withFileTypes: true })) {
      const ruta = `${dir}/${ent.name}`;
      if (ent.isDirectory()) { if (ent.name !== 'node_modules') recorrer(ruta); continue; }
      if (!/\.(ts|tsx)$/.test(ent.name) || /\.test\./.test(ent.name) || ruta === 'lib/supabase-data.ts') continue;
      const f = readFileSync(join(raiz, ruta), 'utf8');
      // El cliente del navegador, por cualquier ruta (alias o relativa): `…/db/supabase`, no `…/db/supabase-admin`.
      if (escribe.test(f) && /from ['"][^'"]*db\/supabase['"]/.test(f)) infractores.push(ruta);
    }
  };
  for (const d of ['app', 'components', 'lib']) recorrer(d);
  assert.deepEqual(infractores, [], 'estos ficheros escriben recibos con el cliente del navegador, que ya no tiene esas columnas');
});
