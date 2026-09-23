import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Las tres RPCs que confirman una reserva DESPUÉS de que naciera (aprobación
// manual, promoción de lista de espera, aceptación de oferta con plazo) solo
// pueden exigir entitlement cuando el gate de reserva también lo exigiría:
// ajuste heredado (tipo de clase sobre estudio) Y estudio con alguna tarifa
// activa. Con la comprobación incondicional, un estudio recién creado (ajuste a
// true de fábrica, tarifas del asistente en borrador) dejaba entrar la reserva y
// luego no podía aprobarla ni promocionarla. Falla cerrado, así que nadie lo
// notaba por un cobro raro: solo por una alumna que nunca entra.
//
// Estructural: lee el ÚLTIMO cuerpo declarado de cada función en las
// migraciones. La verificación en vivo (SQL con ROLLBACK) está en el PR.
// ─────────────────────────────────────────────────────────────────────────────

const DIR = join(import.meta.dirname, '..', 'supabase/migrations');

function cuerpoVigente(fn: string): string {
  let ultimo: string | null = null;
  for (const nombre of readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, nombre), 'utf8');
    const re = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?${fn}\s*\(`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const resto = sql.slice(m.index);
      const abre = resto.search(/\$function\$/);
      if (abre === -1) continue;
      const cierra = resto.indexOf('$function$', abre + '$function$'.length);
      if (cierra === -1) continue;
      ultimo = resto.slice(abre + '$function$'.length, cierra);
    }
  }
  assert.notEqual(ultimo, null, `No se encontró ninguna definición de ${fn}`);
  return ultimo!;
}

for (const fn of ['resolver_reserva_pendiente', 'promocionar_siguiente_espera', 'aceptar_oferta_lista_espera']) {
  test(`${fn}: solo exige entitlement si el estudio exige plan y vende algo`, () => {
    const cuerpo = cuerpoVigente(fn);
    const llamadas = [...cuerpo.matchAll(/socio_tiene_entitlement_activo\s*\(/g)];
    assert.ok(llamadas.length >= 1, `${fn} ya no recomprueba el entitlement: ¿se ha quitado D-2 a propósito?`);
    assert.ok(/reserva_exige_plan\s*\(/.test(cuerpo), `${fn} no consulta reserva_exige_plan`);
    if (/v_exige_plan/.test(cuerpo)) {
      assert.ok(
        /v_exige_plan\s*:=[^;]*reserva_exige_plan\s*\(/.test(cuerpo),
        `${fn}: v_exige_plan debe asignarse desde reserva_exige_plan`,
      );
    }
    for (const l of llamadas) {
      const antes = cuerpo.slice(Math.max(0, l.index! - 260), l.index!);
      assert.ok(
        /reserva_exige_plan|v_exige_plan/.test(antes),
        `${fn}: hay un socio_tiene_entitlement_activo sin la guarda reserva_exige_plan delante`,
      );
    }
  });
}

test('reserva_exige_plan: ajuste heredado (tipo sobre estudio, defecto true) Y tarifa activa', () => {
  const cuerpo = cuerpoVigente('reserva_exige_plan');
  assert.ok(/tc\.reserva_exigir_plan/.test(cuerpo) && /s\.reserva_exigir_plan/.test(cuerpo), 'debe leer el override del tipo y el ajuste del estudio');
  assert.ok(/coalesce\s*\(/i.test(cuerpo) && /,\s*true\s*\)/i.test(cuerpo), 'sin ajuste en ninguno de los dos, por defecto se exige (como el DEFAULT de studios)');
  assert.ok(/planes_tarifa/.test(cuerpo) && /activo\s+is\s+true/i.test(cuerpo), 'debe exigir al menos una tarifa activa');
  assert.ok(/tc\.studio_id\s*=\s*p_studio_id/.test(cuerpo) && /pt\.studio_id\s*=\s*p_studio_id/.test(cuerpo), 'todo acotado al estudio');
});

test('reserva_exige_plan: solo de servidor (ni anon ni authenticated)', () => {
  const sql = readFileSync(join(DIR, '20260923150000_reservas_entitlement_tardio_solo_si_se_exige_y_se_vende.sql'), 'utf8');
  assert.ok(/revoke all on function public\.reserva_exige_plan\(text, text\) from public, anon, authenticated/i.test(sql));
  assert.ok(/grant execute on function public\.reserva_exige_plan\(text, text\) to service_role, postgres/i.test(sql));
});
