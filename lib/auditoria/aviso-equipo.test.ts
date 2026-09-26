import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AVISO_AL_DAR_DE_ALTA, AVISO_DE_CONSERVACION, AVISO_EN_LA_PANTALLA_DE_EQUIPO, AVISO_PARA_LA_PERSONA,
  PLAZO_CONSERVACION_ANIOS, seAnotanSusCambios,
} from './aviso-equipo.ts';
import { correoInvitacionEquipo } from '../emails/tentare/equipo.ts';

const MIGRACION = new URL('../../supabase/migrations/20260925215204_auditoria_conservacion_seis_anios.sql', import.meta.url);
const sql = () => readFileSync(MIGRACION, 'utf8').replace(/--.*$/gm, '');

// ── El plazo: un solo número, dos sitios (TS y SQL), y un test que los ata ─────

test('el plazo del código y el de la base de datos son el mismo número', () => {
  const anios = [...sql().matchAll(/interval\s+'(\d+)\s+years'/g)].map(m => Number(m[1]));
  // El trigger y la purga: si hay uno solo, o uno distinto, el libro se borraría antes o después de lo que se dice.
  assert.ok(anios.length >= 2, `solo se ven ${anios.length} plazos en la migración`);
  assert.deepEqual([...new Set(anios)], [PLAZO_CONSERVACION_ANIOS]);
});

test('todos los textos dicen el plazo que hay de verdad', () => {
  for (const t of [AVISO_PARA_LA_PERSONA, AVISO_AL_DAR_DE_ALTA, AVISO_EN_LA_PANTALLA_DE_EQUIPO, AVISO_DE_CONSERVACION]) {
    assert.match(t, new RegExp(`\\b${PLAZO_CONSERVACION_ANIOS} años\\b`));
  }
});

// ── La excepción a la inmutabilidad: solo la purga, solo lo caducado ──────────

test('el trigger deja borrar SOLO un DELETE, con la purga declarada Y una fila de más de 6 años (comprobaciones anidadas)', () => {
  const s = sql();
  // Anidadas: Postgres no garantiza el orden de un `and`, y en el trigger de TRUNCATE `old` no existe.
  assert.match(
    s,
    /if tg_op = 'DELETE' then\s+if coalesce\(current_setting\('tentare\.purga_auditoria', true\), ''\) = 'on' then\s+if old\.ocurrido_en < now\(\) - interval '6 years' then\s+return old;/,
  );
  // Sin ese camino, siempre se rechaza (UPDATE, TRUNCATE, o un DELETE que no cumple).
  assert.match(s, /raise exception 'auditoria_estudio es inmutable: % no está permitido', tg_op;/);
  // Nada de `and old.`: una referencia a `old` fuera del anidado.
  assert.doesNotMatch(s, /\band\s+old\./);
});

test('la purga declara la variable, la suelta, y un fallo suyo no tumba la purga de las otras tablas', () => {
  const s = sql();
  const bloque = s.match(/begin\s+perform set_config\('tentare\.purga_auditoria', 'on', true\);[\s\S]*?end;\s+delete from cron\.job_run_details/)?.[0];
  assert.ok(bloque, 'no se encuentra el bloque de purga del libro');
  assert.match(bloque, /delete from public\.auditoria_estudio where ocurrido_en < now\(\) - c_auditoria;/);
  assert.match(bloque, /perform set_config\('tentare\.purga_auditoria', '', true\);/);
  assert.match(bloque, /exception when others then/);
  assert.match(bloque, /'auditoria_estudio_error'/, 'un fallo se deja en el resumen, no en silencio');
  // `set_config(..., true)` = local a la transacción. Con `false` la variable quedaría puesta en toda la sesión.
  assert.doesNotMatch(s, /set_config\('tentare\.purga_auditoria',\s*'[^']*',\s*false\)/);
});

test('la purga sigue borrando todo lo que borraba antes (la copia de la función no pierde ninguna tabla)', () => {
  const s = sql();
  for (const tabla of [
    'rate_limits', 'webhook_events', 'notification_delivery', 'notification', 'widget_eventos',
    'intentos_reserva_fallidos', 'automation_logs', 'actividad_reciente', 'email_rebotes', 'auditoria_estudio', 'cron.job_run_details',
  ]) {
    assert.match(s, new RegExp(`delete from (public\\.)?${tabla.replace('.', '\\.')}\\b`), `${tabla}: la purga ya no la borra`);
  }
  // Y sigue siendo de servicio: SECURITY DEFINER con search_path fijado, y esta migración no abre nada a nadie más.
  assert.match(s, /create or replace function public\.purgar_datos_caducados\(\)[\s\S]*?security definer[\s\S]*?set search_path to 'public', 'pg_temp'/);
  assert.match(s, /revoke all on function public\.purgar_datos_caducados\(\) from public, anon, authenticated;/);
  const concesiones = s.match(/\bgrant\b[^;]*;/gi) ?? [];
  assert.deepEqual(concesiones, ['grant execute on function public.purgar_datos_caducados() to service_role;']);
});

// ── A quién se avisa ──────────────────────────────────────────────────────────

test('se avisa a quien trabaja con el dinero en el panel, y solo a esa gente', () => {
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION']) assert.equal(seAnotanSusCambios(rol), true, rol);
  // Una instructora usa la app del estudio y no toca esas tablas: avisarle sería ruido.
  assert.equal(seAnotanSusCambios('INSTRUCTOR'), false);
  // Un rol que no se conoce, o ninguno: no se avisa de lo que no se sabe.
  for (const rol of ['RARO', '', null, undefined]) assert.equal(seAnotanSusCambios(rol), false, String(rol));
});

test('el correo de invitación avisa a recepción antes de aceptar, y no a una instructora', () => {
  const base = { nombre: 'Lola', propietariaNombre: 'Carmen', estudioNombre: 'Casa Pilates', url: 'https://app.example.com/x' };
  const recepcion = correoInvitacionEquipo({ ...base, rol: 'RECEPCION' });
  assert.match(recepcion, /Tentare anota quién lo hizo, cuándo y qué valor había antes/);
  assert.match(recepcion, /se guarda 6 años/);
  assert.match(recepcion, /Solo lo ve la propietaria/);
  // Va ANTES del botón: se lee antes de crear la cuenta.
  assert.ok(recepcion.indexOf('Tentare anota quién lo hizo') < recepcion.indexOf('Crear mi cuenta o entrar'));

  const instructora = correoInvitacionEquipo({ ...base, rol: 'INSTRUCTOR' });
  assert.doesNotMatch(instructora, /anota quién lo hizo/);
  // Un rol desconocido no lo lleva (y su frase sigue sin dejar un hueco).
  assert.doesNotMatch(correoInvitacionEquipo({ ...base, rol: 'RARO' }), /anota quién lo hizo/);
});
