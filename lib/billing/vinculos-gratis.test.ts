import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_ALUMNAS_COMUNES, MOTIVOS_QUE_CUENTAN, MOTIVOS_VINCULO, PCT_ALUMNAS_COMUNES, TEXTO_MOTIVO,
  enDiasDeAlta, huellaAltaActiva, vinculadosDelGrupo, type FilaVinculo,
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

test('vinculadosDelGrupo: el nuevo se suma al viejo, nunca al revés (el copiado no carga con quien copia)', () => {
  // `studio_id` es el nuevo (el medido), `vinculado_id` el viejo.
  assert.deepEqual(vinculadosDelGrupo(['nuevo'], [v('nuevo', 'viejo'), v('nuevo', 'viejo')]), ['viejo']);
  assert.deepEqual(vinculadosDelGrupo(['viejo'], [v('nuevo', 'viejo')]), [], 'el viejo no se suma al nuevo');
  // Un vínculo entre dos estudios del mismo grupo no añade nada.
  assert.deepEqual(vinculadosDelGrupo(['a', 'b'], [v('a', 'b')]), []);
  // Uno que no toca al grupo, tampoco.
  assert.deepEqual(vinculadosDelGrupo(['a'], [v('x', 'y')]), []);
});

test('vinculadosDelGrupo: lo que solo avisa y lo desvinculado en /interno NO suman', () => {
  assert.deepEqual(vinculadosDelGrupo(['a'], [v('a', 'b', { cuenta: false })]), []);
  assert.deepEqual(vinculadosDelGrupo(['a'], [v('a', 'b', { descartado_en: '2026-10-19T10:00:00Z' })]), []);
});

test('la huella del alta: solo en los primeros días del estudio', () => {
  const ahora = new Date('2026-10-19T12:00:00Z');
  assert.equal(enDiasDeAlta('2026-10-10T12:00:00Z', ahora), true);
  assert.equal(enDiasDeAlta('2026-09-01T12:00:00Z', ahora), false);
  assert.equal(enDiasDeAlta(null, ahora), false);
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
  // Solo contra estudios MÁS ANTIGUOS que ya se pasaron o están cerrados.
  assert.match(sql, /s\.creado_en < v_creado/);
  assert.match(sql, /s\.subscription_status = 'gratis_cerrado' or u\.excedido_desde is not null/);
  // La cuenta de Stripe, también la ya desconectada (historial y anterior).
  assert.match(sql, /c\.stripe_account_id in \(v_stripe, v_stripe_ant\)/);
  // Alumnas y NIF: solo lo que el SERVIDOR vio en el viejo antes del alta del nuevo.
  assert.match(sql, /r\.tipo = 'alumna' and r\.clave = m\.clave and r\.visto_en < v_creado/);
  assert.match(sql, /r\.tipo = 'nif'[\s\S]*?r\.visto_en < v_creado/);
  // El rastro se apunta en cada medición, con la hora del servidor.
  assert.match(sql, /insert into rastro_gratis \(studio_id, tipo, clave\)/);
  // Nunca deshace un descarte de /interno al volver a detectar.
  assert.match(sql, /on conflict \(studio_id, vinculado_id, motivo\)\s+do update set detalle = excluded\.detalle/);
});

test('el gate suma los vinculados, detecta antes de medir y nunca escribe el margen de otra dueña', () => {
  const src = leer('lib/billing/uso-gratis-servidor.ts');
  assert.match(src, /vinculados: await estudiosVinculadosGratis\(admin, propios\)/);
  const refrescar = src.slice(src.indexOf('export async function refrescarUsoGratis'));
  assert.ok(refrescar.indexOf('detectarVinculosGratis') < refrescar.indexOf('grupoDeLaDuena'));
  // La fecha de exceso, solo en los propios; los vinculados, solo cifras.
  assert.match(refrescar, /grupo\.propios\.map\(id => \(\{ \.\.\.cifras\(id\), excedido_desde: desde \}\)\)/);
  assert.match(refrescar, /grupo\.vinculados\.map\(cifras\)/);
  const cifras = refrescar.slice(refrescar.indexOf('const cifras'), refrescar.indexOf('};', refrescar.indexOf('const cifras')));
  assert.doesNotMatch(cifras, /excedido_desde/);
  // Y el servidor lee solo la dirección nuevo → viejo.
  const srv = leer('lib/billing/vinculos-gratis-servidor.ts');
  assert.match(srv, /\.in\('studio_id', \[\.\.\.grupo\]\)/);
  assert.doesNotMatch(srv, /\.in\('vinculado_id'/);
});

test('desvincular en /interno descarta los dos sentidos y reabre por la única puerta que escribe «gratis»', () => {
  const ruta = leer('app/api/interno/estudios/[id]/acciones/route.ts');
  const tramo = ruta.slice(ruta.indexOf("cuerpo.accion === 'desvincular-cuenta'"));
  assert.match(tramo, /eq\('studio_id', id\)\.eq\('vinculado_id', otroId\)/);
  assert.match(tramo, /eq\('studio_id', otroId\)\.eq\('vinculado_id', id\)/);
  // Reabre solo el NUEVO de un vínculo que sumaba (no el de la ficha a ciegas, ni por un aviso).
  assert.match(tramo, /descartados\.filter\(d => d\.cuenta\)\.map\(d => d\.studio_id\)/);
  assert.match(tramo, /reabrirPlanGratis\(db, nuevo\)/);
  assert.match(tramo, /for \(const objetivo of \[id, otroId\]\)/, 'auditado en los dos estudios');
  const reabrir = leer('lib/billing/convertir-a-gratis.ts');
  assert.match(reabrir, /export async function reabrirPlanGratis/);
  // Dice de verdad qué reabrió (no `!error`).
  assert.match(reabrir, /\.eq\('subscription_status', ESTADO_GRATIS_CERRADO\)\.select\('id'\)/);
});
