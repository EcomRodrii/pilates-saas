import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_ALUMNAS_COMUNES, MOTIVOS_QUE_CUENTAN, MOTIVOS_VINCULO, PCT_ALUMNAS_COMUNES, TEXTO_MOTIVO,
  huellaAltaActiva, vinculadosDelGrupo, type FilaVinculo,
} from './vinculos-gratis.ts';

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '');

/** La última definición de `detectar_vinculos_gratis` en las migraciones. */
function detectarSql(): string {
  const dir = join(RAIZ, 'supabase/migrations');
  const ultima = readdirSync(dir).filter(n => n.endsWith('.sql')).sort()
    .filter(n => /create or replace function public\.detectar_vinculos_gratis/.test(readFileSync(join(dir, n), 'utf8'))).pop();
  assert.ok(ultima, 'no hay ninguna migración con detectar_vinculos_gratis');
  return sinComentarios(readFileSync(join(dir, ultima), 'utf8'));
}

const v = (studio_id: string, vinculado_id: string, extra: Partial<FilaVinculo> = {}): FilaVinculo =>
  ({ studio_id, vinculado_id, cuenta: true, descartado_en: null, ...extra });

test('vinculadosDelGrupo: los dos lados del vínculo, sin repetir y sin los del propio grupo', () => {
  assert.deepEqual(vinculadosDelGrupo(['a'], [v('a', 'b'), v('c', 'a'), v('a', 'b')]).sort(), ['b', 'c']);
  // Un vínculo entre dos estudios del mismo grupo no añade nada.
  assert.deepEqual(vinculadosDelGrupo(['a', 'b'], [v('a', 'b')]), []);
  // Uno que no toca al grupo, tampoco.
  assert.deepEqual(vinculadosDelGrupo(['a'], [v('x', 'y')]), []);
});

test('vinculadosDelGrupo: lo que solo avisa y lo desvinculado en /interno NO suman', () => {
  assert.deepEqual(vinculadosDelGrupo(['a'], [v('a', 'b', { cuenta: false })]), []);
  assert.deepEqual(vinculadosDelGrupo(['a'], [v('a', 'b', { descartado_en: '2026-10-19T10:00:00Z' })]), []);
});

test('la huella del alta va apagada por defecto (la revisa un abogado antes)', () => {
  assert.equal(huellaAltaActiva({}), false);
  assert.equal(huellaAltaActiva({ HUELLA_ALTA: 'true' }), false);
  assert.equal(huellaAltaActiva({ HUELLA_ALTA: ' on ' }), true);
});

test('umbrales de alumnas: con unas pocas en común no se toca a nadie', () => {
  assert.ok(MIN_ALUMNAS_COMUNES >= 20, 'dos estudios del mismo barrio comparten alguna alumna');
  assert.ok(PCT_ALUMNAS_COMUNES >= 0.5);
  // El servidor pasa ESTOS umbrales a la función SQL, no otros escritos a mano.
  const srv = leer('lib/billing/vinculos-gratis-servidor.ts');
  assert.match(srv, /p_min_comunes: MIN_ALUMNAS_COMUNES, p_pct_comunes: PCT_ALUMNAS_COMUNES/);
});

test('los motivos de TypeScript son los de la tabla y los de la función, y cuentan los mismos', () => {
  const tabla = sinComentarios(leer('supabase/migrations/20261019182849_vinculos_cuentas_gratis.sql'));
  const check = tabla.match(/motivo text not null check \(motivo in \(([^)]*)\)\)/);
  assert.ok(check, 'falta el CHECK de motivo');
  assert.deepEqual(check[1].split(',').map(s => s.trim().replace(/'/g, '')).sort(), [...MOTIVOS_VINCULO].sort());
  for (const m of MOTIVOS_VINCULO) assert.ok(TEXTO_MOTIVO[m], `${m} sin texto en /interno`);

  // En la función: cada motivo con su `cuenta` (true/false).
  const sql = detectarSql();
  for (const m of MOTIVOS_VINCULO) {
    const fila = sql.match(new RegExp(`'${m}'(?:::text)?(?: as mot)?, (true|false)`));
    assert.ok(fila, `la función no produce el motivo ${m}`);
    assert.equal(fila[1] === 'true', MOTIVOS_QUE_CUENTAN.includes(m), `${m}: cuenta distinto en SQL y en TS`);
  }
});

test('la detección: solo service_role, compara contra el historial de Stripe y no se cruza consigo misma', () => {
  const sql = detectarSql();
  assert.match(sql, /#variable_conflict use_column/, 'sin esto, RETURNS TABLE choca con las columnas (42702)');
  assert.match(sql, /security definer/);
  assert.match(sql, /owner_auth_user_id is distinct from v_owner/, 'los de la misma dueña ya se suman por otro lado');
  assert.match(sql, /cuentas_stripe_vistas c where c\.studio_id = o\.id/, 'la cuenta de Stripe, también la ya desconectada');
  assert.match(sql, /subscription_status = 'gratis_cerrado' or o\.excedido_desde is not null/,
    'alumnas y huella solo contra un estudio que ya se pasó o está cerrado');
  // Nunca deshace un descarte de /interno al volver a detectar.
  assert.match(sql, /on conflict \(studio_id, vinculado_id, motivo\)\s+do update set detalle = excluded\.detalle/);
});

test('el grupo que mide el gate incluye los vinculados, y se detecta antes de medir', () => {
  const src = leer('lib/billing/uso-gratis-servidor.ts');
  assert.match(src, /\.\.\.\(await estudiosVinculadosGratis\(admin, propios\)\)/);
  const refrescar = src.slice(src.indexOf('export async function refrescarUsoGratis'));
  assert.ok(refrescar.indexOf('detectarVinculosGratis') < refrescar.indexOf('estudiosGratisDeLaDuena'));
});

test('desvincular en /interno descarta los dos sentidos y reabre por la única puerta que escribe «gratis»', () => {
  const ruta = leer('app/api/interno/estudios/[id]/acciones/route.ts');
  const tramo = ruta.slice(ruta.indexOf("cuerpo.accion === 'desvincular-cuenta'"));
  assert.match(tramo, /eq\('studio_id', id\)\.eq\('vinculado_id', otroId\)/);
  assert.match(tramo, /eq\('studio_id', otroId\)\.eq\('vinculado_id', id\)/);
  assert.match(tramo, /reabrirPlanGratis\(db, id\)/);
  assert.match(tramo, /registrar\(db, req,/);
  assert.match(leer('lib/billing/convertir-a-gratis.ts'), /export async function reabrirPlanGratis/);
});
