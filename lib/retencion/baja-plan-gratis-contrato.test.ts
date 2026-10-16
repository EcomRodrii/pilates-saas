// La baja del plan gratis (decisión del fundador, 16-oct-2026; migr 20261015233500) vive en la BD: un estudio
// gratis con el panel cerrado entra en la baja de pago a los 90 días de cerrarse. Este test, sin base de datos,
// ata lo que la BD hace con lo que el código y los textos dan por hecho, en la ÚLTIMA migración que define
// cada función (las pruebas contra Postgres están en supabase/tests/plan-gratis-baja.test.ts, solo en CI):
//
//  · los días son los de las constantes: MARGEN_DIAS de margen + DIAS_PLAN_GRATIS_CERRADO_ANTES_DE_BAJA cerrado;
//  · el «hoy» es el de Madrid (`hoy_estudio()`), nunca current_date, y el borde entra (`>=`);
//  · los estados son los del plan gratis de plan-gratis.ts;
//  · la guardia de la purga usa la misma regla y la excepción de las cadenas;
//  · el barrido le da cuerda al reloj ANTES de leer quién está en baja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ESTADO_GRATIS, ESTADO_GRATIS_CERRADO, MARGEN_DIAS } from '../billing/plan-gratis.ts';
import { DIAS_PLAN_GRATIS_CERRADO_ANTES_DE_BAJA } from './ciclo-estudios-vencidos.ts';

const RAIZ = join(import.meta.dirname, '../..');
const MIGRACIONES = join(RAIZ, 'supabase/migrations');

/** El cuerpo de la función en la última migración que la (re)define. */
function cuerpoVigente(nombre: string): string {
  const inicio = new RegExp(`create or replace function public\\.${nombre}\\s*\\(`, 'i');
  const ficheros = readdirSync(MIGRACIONES).filter(f => f.endsWith('.sql')).sort().reverse();
  for (const f of ficheros) {
    const sql = readFileSync(join(MIGRACIONES, f), 'utf8');
    const m = inicio.exec(sql);
    if (!m) continue;
    const desde = sql.indexOf('$$', m.index);
    const hasta = sql.indexOf('$$', desde + 2);
    return sql.slice(m.index, hasta + 2);
  }
  throw new Error(`ninguna migración define public.${nombre}`);
}

test('la regla: margen + días cerrado, en días de Madrid, con el borde incluido', () => {
  const f = cuerpoVigente('plan_gratis_entra_en_baja');
  assert.match(f, /p_hoy date default public\.hoy_estudio\(\)/i, 'el «hoy» por defecto es el de Madrid');
  assert.doesNotMatch(f, /current_date/i);
  assert.ok(
    f.includes(`p_hoy >= greatest(u.excedido_desde + ${MARGEN_DIAS}, (u.creado_en at time zone 'Europe/Madrid')::date) + ${DIAS_PLAN_GRATIS_CERRADO_ANTES_DE_BAJA}`),
    `la BD tiene que contar ${MARGEN_DIAS} días de margen + ${DIAS_PLAN_GRATIS_CERRADO_ANTES_DE_BAJA} cerrado, con >= y el día de Madrid: si cambia un plazo, cambia en los dos sitios`,
  );
  assert.ok(f.includes(`p_estado in ('${ESTADO_GRATIS}', '${ESTADO_GRATIS_CERRADO}')`), 'los estados del plan gratis');
});

test('el trigger, el reloj y la guardia de la purga deciden con la misma función', () => {
  const decision = cuerpoVigente('baja_del_plan_gratis');
  assert.match(decision, /public\.plan_gratis_entra_en_baja\(p_studio_id, p_estado\)/);
  // Ni con la cadena pagando ni con un pago de Cadena en marcha: nada de «descarga tus datos» en mitad de un 3DS.
  assert.match(decision, /c\.subscription_status in \('active', 'trialing', 'past_due', 'unpaid', 'incomplete'\)/);
  // Otra sede con plan propio vivo la conserva, salvo que pidiera el borrado.
  assert.match(decision, /p_pedida is not null or not public\.cadena_con_otra_sede_viva\(p_cadena_id, p_studio_id\)/);

  assert.match(cuerpoVigente('fijar_contrato_terminado'), /baja_del_plan_gratis\(new\.id, v_estado, new\.cadena_id, v_pedida\)/);
  assert.match(cuerpoVigente('reevaluar_baja_plan_gratis'),
    /is distinct from public\.baja_del_plan_gratis\(s\.id, s\.subscription_status, s\.cadena_id, s\.supresion_pedida_en\)/,
    'el reloj vuelve a pasar por el trigger lo desajustado, en los dos sentidos');
  const purga = cuerpoVigente('purgar_estudio_vencido');
  assert.match(purga, /baja_del_plan_gratis\(v_estudio\.id, v_estudio\.subscription_status, v_estudio\.cadena_id,\s+v_estudio\.supresion_pedida_en\)/);
  // Una sede que pidió el borrado se purga aunque otra sede pague: si no, su petición no se cumpliría nunca.
  assert.match(purga, /v_estudio\.supresion_pedida_en is null\s+and public\.cadena_con_otra_sede_viva/);
  // Un gratis con los 90 días cumplidos no cuenta como plan vivo de la cadena.
  assert.match(cuerpoVigente('cadena_con_otra_sede_viva'), /not public\.plan_gratis_entra_en_baja\(s\.id, s\.subscription_status\)/);
});

test('el barrido le da cuerda al reloj antes de leer quién está en baja', () => {
  const barrido = readFileSync(join(RAIZ, 'lib/retencion/avanzar-ciclo-estudios-vencidos.ts'), 'utf8');
  const reloj = barrido.indexOf("rpc('reevaluar_baja_plan_gratis')");
  const lectura = barrido.indexOf("from('studios')");
  assert.ok(reloj > 0, 'el barrido llama a reevaluar_baja_plan_gratis');
  assert.ok(reloj < lectura, 'y lo hace antes de leer los estudios: si no, entrarían en baja una pasada tarde');
});
