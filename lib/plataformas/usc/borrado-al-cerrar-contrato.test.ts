// Contrato del borrado de datos de USC (anexo 1 del contrato, §6(4) y §11(2)):
// una reserva de USC que se cancela o no asiste pierde el nombre y el id de la
// persona. Vive en la base de datos (`20261105154832_usc_borrar_datos_al_cerrar_reserva.sql`);
// aquí se fijan las piezas que, si cambian sin querer, rompen la garantía.
// Probado además en una transacción deshecha contra producción el 5-nov-2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (f: string) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const MIGRACION = 'supabase/migrations/20261105154832_usc_borrar_datos_al_cerrar_reserva.sql';
const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '');

test('solo borra a quien viene de USC, y solo al cancelar o no asistir', () => {
  const sql = sinComentarios(leer(MIGRACION));
  assert.match(sql, /new\.origen = 'URBAN_SPORTS_CLUB'/);
  assert.match(sql, /new\.estado in \('CANCELADA', 'NO_ASISTIO'\)/);
  // La asistida conserva sus datos, y ClassPass / Wellhub no se tocan.
  assert.ok(!/ASISTIDA/.test(sql));
  assert.ok(!/CLASSPASS|WELLHUB/.test(sql));
});

test('pone el mismo texto que la purga de un estudio y borra el id de la persona', () => {
  const sql = sinComentarios(leer(MIGRACION));
  assert.match(sql, /new\.nombre_externo := 'Persona eliminada'/);
  assert.match(sql, /new\.id_cliente_externo := null/);
  // El id de la RESERVA en USC se queda: lo usan sus webhooks.
  assert.ok(!/id_reserva_externa/.test(sql));
  const purga = leer('supabase/migrations/20261007143246_purga_reservas_externas_y_plataformas.sql');
  assert.match(purga, /Persona eliminada/);
});

test('el trigger dispara DESPUÉS del candado de origen y solo al tocar `estado`', () => {
  const sql = sinComentarios(leer(MIGRACION));
  const nombre = /create trigger (\w+)\s+before update of estado on public\.reservas/.exec(sql)?.[1];
  assert.ok(nombre, 'falta el trigger BEFORE UPDATE OF estado');
  // Los BEFORE disparan por orden alfabético: tiene que sonar después de
  // `trg_congelar_origen_reserva`, que prohíbe cambiar estos campos desde el navegador.
  assert.ok(nombre > 'trg_congelar_origen_reserva', `${nombre} no suena después del candado de origen`);
  // Y el candado no se toca: esta migración no lo redefine.
  assert.ok(!/function public\.congelar_origen_reserva/.test(sql));
});

test('la función de trigger no la llama nadie del cliente', () => {
  const sql = sinComentarios(leer(MIGRACION));
  assert.match(sql, /revoke all on function public\.anonimizar_externa_al_cerrar\(\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.anonimizar_externa_al_cerrar\(\) to service_role, postgres/);
});
