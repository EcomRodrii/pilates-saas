// Guardia estática de las migraciones de Veri*Factu del envío directo.
//
// Lo que se comprueba aquí, leyendo el SQL (la verificación en vivo contra la
// base se hace aparte, con la migración aplicada en una transacción revertida):
//   · toda tabla nueva tiene RLS y revoca explícitamente a anon/authenticated;
//   · nada concede a anon;
//   · los registros fiscales no se pueden borrar ni reescribir (triggers);
//   · las transiciones de estado que hace cumplir la base son EXACTAMENTE las de
//     `lib/verifactu/estado.ts` — si alguien cambia una sin la otra, esto falla.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { transicionPermitida, type EstadoRegistroVerifactu } from './estado.ts';

const DIR = 'supabase/migrations';
const MIGRACIONES = [
  '20260930003500_verifactu_registros_y_envios.sql',
  '20260930013000_verifactu_declaraciones_responsables.sql',
  '20260930020000_verifactu_estudios_y_apoderamientos.sql',
  '20260930030000_verifactu_inmutabilidad_y_lectura.sql',
];
const sql = MIGRACIONES.map(f => readFileSync(join(DIR, f), 'utf8'));
const todo = sql.join('\n');
const sinComentarios = todo.replace(/--[^\n]*/g, '');

test('las cuatro migraciones existen', () => {
  const hay = new Set(readdirSync(DIR));
  for (const f of MIGRACIONES) assert.ok(hay.has(f), f);
});

const TABLAS = [
  'verifactu_registros', 'verifactu_envios', 'verifactu_declaraciones_responsables',
  'verifactu_estudios', 'verifactu_representaciones', 'verifactu_representacion_eventos', 'verifactu_control_flujo',
];

test('toda tabla nueva: RLS activa y revoke explícito a anon y authenticated', () => {
  for (const t of TABLAS) {
    assert.match(sinComentarios, new RegExp(`alter table public\\.${t} enable row level security`), `${t}: sin RLS`);
    assert.match(sinComentarios, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`), `${t}: sin revoke`);
  }
});

test('nada se concede a anon', () => {
  assert.doesNotMatch(sinComentarios, /grant [^;]* to [^;]*\banon\b/i);
});

test('ningún registro fiscal se borra: sin DELETE para service_role y con trigger', () => {
  for (const t of TABLAS) assert.match(sinComentarios, new RegExp(`revoke [^;]*delete[^;]* on public\\.${t} from service_role`), `${t}: service_role conserva DELETE`);
  assert.match(sinComentarios, /create trigger trg_verifactu_registro_inmutable\s+before update or delete on public\.verifactu_registros/);
  assert.match(sinComentarios, /create trigger trg_verifactu_envio_inmutable\s+before update or delete on public\.verifactu_envios/);
  assert.match(sinComentarios, /create trigger trg_verifactu_repr_eventos_solo_anadir\s+before update or delete on public\.verifactu_representacion_eventos/);
  assert.match(sinComentarios, /create trigger trg_verifactu_dr_solo_anadir\s+before update or delete on public\.verifactu_declaraciones_responsables/);
  assert.match(sinComentarios, /create trigger trg_verifactu_repr_sin_borrar\s+before delete on public\.verifactu_representaciones/);
  assert.match(sinComentarios, /create trigger trg_factura_sellada_inmutable\s+before update or delete on public\.facturas/);
});

test('la lectura desde el cliente va siempre con el ROL, nunca solo por estudio', () => {
  const politicas = [...sinComentarios.matchAll(/create policy (\w+) on public\.(\w+)[\s\S]*?using \(([^;]*)\);/g)];
  assert.ok(politicas.length >= 4);
  for (const [, nombre, , using] of politicas) {
    assert.match(using, /current_studio_id\(\)/, nombre);
    assert.match(using, /puede_ver_finanzas\(\)|current_rol\(\) = 'PROPIETARIO'/, `${nombre}: sin rol, se lo abriría a INSTRUCTOR`);
  }
});

test('el XML y la respuesta cruda nunca se conceden al cliente', () => {
  const grantRegistros = /grant select \(([\s\S]*?)\) on public\.verifactu_registros to authenticated/.exec(sinComentarios)?.[1] ?? '';
  assert.ok(grantRegistros, 'la lectura de registros va por columnas');
  assert.doesNotMatch(grantRegistros, /xml_registro|datos_corregidos/);
  assert.doesNotMatch(sinComentarios, /grant [^;]* on public\.verifactu_envios to authenticated/);
  assert.doesNotMatch(sinComentarios, /grant [^;]* on public\.verifactu_declaraciones_responsables to authenticated/);
});

test('las transiciones que hace cumplir la base son exactamente las de estado.ts', () => {
  const cuerpo = /verifactu_transicion_permitida[\s\S]*?\(p_de, p_a\) in \(([\s\S]*?)\);\s*\$\$/.exec(todo)?.[1] ?? '';
  const pares = new Set([...cuerpo.matchAll(/\('(\w+)', '(\w+)'\)/g)].map(m => `${m[1]}>${m[2]}`));
  assert.ok(pares.size > 10, 'no se encontró la tabla de transiciones en el SQL');
  const ESTADOS: EstadoRegistroVerifactu[] = ['RESERVADO', 'PENDIENTE', 'LISTO', 'ENVIANDO', 'REINTENTAR', 'INCIERTO', 'REGISTRADA', 'ACEPTADA_CON_ERRORES', 'ANULADA_EN_AEAT', 'RECHAZADA', 'HISTORICO'];
  for (const de of ESTADOS) {
    for (const a of ESTADOS) {
      if (de === a) continue;
      assert.equal(pares.has(`${de}>${a}`), transicionPermitida(de, a), `${de} → ${a}: la base y el código no coinciden`);
    }
  }
});

test('la punta de la cadena de reservar_numero_factura incluye los registros de subsanación y anulación', () => {
  const rnf = /create or replace function public\.reservar_numero_factura[\s\S]*?\$function\$;/.exec(sinComentarios)?.[0] ?? '';
  assert.match(rnf, /verifactu_punta_cadena\(p_studio_id\)/);
  // Y conserva la cerradura del modo de facturación (PR #2370), que ya está en producción.
  assert.match(rnf, /FACTURACION_DESACTIVADA/);
});

// Solo VERI*FACTU (declaración responsable, 1.e = S): ninguna factura nueva
// nace para un estudio cuyo envío no se ha activado nunca. La prueba en vivo de
// los triggers se hizo contra un Postgres local desechable (ver el PR).
const SOLO_CON_ENVIO = readFileSync(join(DIR, '20260930170000_verifactu_facturas_solo_con_envio_activo.sql'), 'utf8')
  .replace(/--[^\n]*/g, '');

test('solo VERI*FACTU: emitir facturas exige el envío activado, y la primera activación las enciende', () => {
  assert.match(SOLO_CON_ENVIO, /create trigger trg_studios_facturas_exigen_envio_activo\s+before insert or update of modo_facturacion on public\.studios/);
  assert.match(SOLO_CON_ENVIO, /activado_produccion_en is not null/);
  assert.match(SOLO_CON_ENVIO, /create trigger trg_verifactu_activacion_enciende_facturas\s+after update of activado_produccion_en on public\.verifactu_estudios/);
  // Solo la PRIMERA activación (NULL → fecha): una reactivación no enciende lo que el estudio apagó.
  assert.match(SOLO_CON_ENVIO, /old\.activado_produccion_en is null and new\.activado_produccion_en is not null/);
  // Los estudios que ya emitían sin envío dejan de emitir en la misma migración.
  assert.match(SOLO_CON_ENVIO, /update public\.studios s\s+set modo_facturacion = 'sin_facturas'/);
});

test('solo VERI*FACTU: las funciones de trigger nuevas no se ejecutan desde el cliente', () => {
  for (const f of ['studios_facturas_exigen_envio_activo', 'verifactu_activacion_enciende_facturas']) {
    assert.match(SOLO_CON_ENVIO, new RegExp(`revoke execute on function public\\.${f}\\(\\) from public, anon, authenticated`), f);
  }
  assert.doesNotMatch(SOLO_CON_ENVIO, /grant [^;]* to [^;]*\b(anon|authenticated)\b/i);
});

// Sin poder, sin facturas (pregunta 6 de la consulta al fiscalista, pendiente).
const SIN_PODER = readFileSync(join(DIR, '20260930190000_verifactu_sin_poder_sin_facturas.sql'), 'utf8')
  .replace(/--[^\n]*/g, '');

test('sin poder, sin facturas: perderlo las para, una pausa no, y encender exige poder vigente', () => {
  assert.match(SIN_PODER, /create trigger trg_verifactu_sin_poder_para_facturas\s+after update of estado on public\.verifactu_estudios/);
  assert.match(SIN_PODER, /v\.estado in \('PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO'\)/);
  assert.match(SIN_PODER, /revoke execute on function public\.verifactu_sin_poder_para_facturas\(\) from public, anon, authenticated/);
  assert.doesNotMatch(SIN_PODER, /grant [^;]* to [^;]*\b(anon|authenticated)\b/i);
});
