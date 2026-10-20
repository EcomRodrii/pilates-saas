import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contrato del pago de «semana completa» con la racha única (PR 3.3-B, D12): el servidor decide y paga
// por la asistencia de ESTA semana con el mínimo del estudio; el panel deja de calcularlo; el RPC
// estrecha su ventana. Todo el comportamiento nuevo, tras `RACHA_UNICA`.

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pos = (s: string, t: string) => { const i = s.indexOf(t); assert.notEqual(i, -1, `falta «${t}»`); return i; };

test('el servidor paga solo si la semana en curso está hecha, y con el interruptor apagado paga como siempre', () => {
  const admin = sinComentarios(leer('lib/db/supabase-data-admin.ts'));
  assert.match(admin, /if \(r\.semanaEnCurso\.estado !== 'hecha'\) return false/);
  assert.match(admin, /otorgarCreditosServidor\(admin, studioId, socioId, 'SEMANA_COMPLETA', `\$\{socioId\}:\$\{r\.claveSemanaActual\}`\)/);
  // Encendido → función única; apagado → el cálculo de siempre, intacto.
  assert.match(admin, /if \(rachaUnicaEncendida\(studioId\)\) \{[\s\S]*?pagarSemanaCompletaUnica\(admin, studioId, socioId\);[\s\S]*?\} else \{[\s\S]*?calcularRacha\(ctx\.reservas, ctx\.sesiones, new Date\(\)\)/);
  // Nunca por una meta personal: no se lee ningún objetivo de la socia en esa función.
  const fn = admin.slice(admin.indexOf('export async function pagarSemanaCompletaUnica'), admin.indexOf('async function evaluarGamificacionServidor'));
  assert.doesNotMatch(fn, /objetivo|metaPersonal|objetivoClasesMes/);
});

test('la ruta del panel: sesión de personal y rol ANTES del interruptor; estudio de la sesión y socia de la reserva', () => {
  const ruta = sinComentarios(leer('app/api/gamificacion/semana-completa/route.ts'));
  const orden = [
    pos(ruta, 'enforceRateLimit(req'),
    pos(ruta, 'verificarSesionStaff(req)'),
    pos(ruta, 'puedeGestionarClientas(sesion.rol)'),
    pos(ruta, 'rachaUnicaEncendida(sesion.studioId)'),
    pos(ruta, ".eq('studio_id', sesion.studioId)"),
    pos(ruta, 'pagarSemanaCompletaUnica(admin, sesion.studioId, socioId)'),
  ];
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.doesNotMatch(ruta, /body\??\.socioId|body\??\.studioId/);
  assert.match(ruta, /estado !== 'ASISTIDA'/);
  assert.match(ruta, /unica: false/);
});

test('el panel pregunta al servidor y solo sigue el camino de siempre si este dice que no', () => {
  const panel = sinComentarios(leer('lib/studio-context.tsx'));
  assert.match(panel, /fetch\('\/api\/gamificacion\/semana-completa'/);
  assert.match(panel, /if \(unica\) return;\s*const racha = calcularRacha\(reservasDeLaSocia, sesiones, new Date\(\)\)/);
});

test('la migración estrecha el RPC a 7 días, solo lunes y sin clases canceladas, sin tocar permisos', () => {
  const sql = leer('supabase/migrations/20261020160000_semana_completa_ventana_de_7_dias.sql');
  assert.match(sql, /PROPUESTA, NO APLICADA/);
  assert.match(sql, /'extract\(isodow from v_lunes\) not in \(1, 7\)', 'extract\(isodow from v_lunes\) <> 1'/);
  assert.match(sql, /\(v_lunes \+ 8\)::timestamp at time zone ''Europe\/Madrid''', '\(v_lunes \+ 7\)/);
  assert.match(sql, /not coalesce\(s\.cancelada, false\)/);
  // Mismos permisos antes y después, para las tres roles.
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(sql, /has_function_privilege\('service_role'/);
  assert.match(sql, /v_antes <> v_despues/);
  // Sin función nueva ni grants nuevos: misma firma.
  const codigo = sql.replace(/^\s*--.*$/gm, '');
  assert.doesNotMatch(codigo, /create (or replace )?function/i);
  assert.doesNotMatch(codigo, /\bgrant\b/i);
});
