import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// CANCEL-1 (auditoría 25-sep): la devolución del bono al cancelar vive en TypeScript
// DESPUÉS del commit de `cancelar_reserva_plaza`. La migración deja constancia, en la
// MISMA transacción, de que la devolución PROCEDE, y un barrido en SQL la repara.
// Un barrido «canceladas con bono sin devolver» a secas devolvería también las
// cancelaciones TARDÍAS, que la política no devuelve a propósito.

const SQL = readFileSync(
  new URL('../../supabase/migrations/20260925132205_cancel1_devolucion_bono_debida_y_barrido.sql', import.meta.url), 'utf8');

test('⚠️ la marca solo se escribe si la política concede la devolución y el bono era rastreado', () => {
  const upd = SQL.indexOf("update reservas set estado = 'CANCELADA'");
  assert.ok(upd > 0, 'no se encuentra el UPDATE de la cancelación');
  const bloque = SQL.slice(upd, SQL.indexOf('where id = p_reserva_id', upd));
  assert.match(bloque, /when v_devolver and v_estado in \('CONFIRMADA', 'ASISTIDA'\)/, 'sin v_devolver se marcarían las tardías');
  assert.match(bloque, /bono_consumo_rastreado is true and bono_suscripcion_id is not null/);
  assert.match(bloque, /bono_devuelto_en is null/);
});

test('el barrido reutiliza la RPC idempotente por reserva, solo canceladas con marca antigua, y sigue tras un fallo', () => {
  const barrido = SQL.slice(SQL.indexOf('create or replace function public.reparar_devoluciones_bono'));
  assert.match(barrido, /public\.devolver_sesion_bono_por_reserva\(r\.studio_id, r\.id\)/);
  assert.match(barrido, /estado = 'CANCELADA'/);
  assert.match(barrido, /bono_devolucion_debida_en < now\(\) - interval '5 minutes'/);
  assert.match(barrido, /bono_devuelto_en is null/);
  assert.match(barrido, /exception when others then/, 'un fallo en una reserva no puede parar las demás');
});

test('los dos son solo de servidor: revocados a anon y authenticated por nombre', () => {
  for (const f of ['cancelar_reserva_plaza(text, text, text, boolean)', 'reparar_devoluciones_bono()']) {
    const esc = f.replace(/[()]/g, '\\$&');
    assert.match(SQL, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`));
  }
  assert.match(SQL, /grant execute on function public\.reparar_devoluciones_bono\(\) to postgres, service_role/);
});

test('el pg_cron corre el barrido cada 15 minutos', () => {
  assert.match(SQL, /cron\.schedule\(\s*'reparar-devoluciones-bono',\s*'\*\/15 \* \* \* \*'/);
});
