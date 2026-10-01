import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  altaDesdeFila,
  claveIdempotenciaRecordatorio,
  contenidoRecordatorio,
  decidirRecordatorio,
  filaParaInterno,
  leerEventoProgreso,
  pasoDeAlta,
  resumirAltas,
  type AltaEstudio,
} from './abandono.ts';

const HORA = 3_600_000;
const AHORA = Date.parse('2026-10-02T12:00:00Z');
const hace = (horas: number) => new Date(AHORA - horas * HORA).toISOString();

function alta(p: Partial<AltaEstudio> = {}): AltaEstudio {
  return {
    authUserId: '00000000-0000-0000-0000-000000000001',
    email: 'ana@example.com',
    origen: 'registro',
    estudioNombre: 'Estudio Aurora',
    iniciadaEn: hace(30),
    emailConfirmadoEn: null,
    planEn: null,
    errorEstudioEn: null,
    errorEstudioIntentos: 0,
    estudioCreadoEn: null,
    esEquipo: false,
    avisadoAntes: false,
    recordatorioReclamadoEn: null,
    recordatorioEnviadoEn: null,
    recordatorioPaso: null,
    recordatorioIntentos: 0,
    recordatorioDescartado: null,
    ...p,
  };
}

// ── El paso ─────────────────────────────────────────────────────────────────

test('registro sin confirmar: le falta el código, desde que empezó', () => {
  assert.deepEqual(pasoDeAlta(alta()), { paso: 'email_sin_confirmar', desde: hace(30) });
});

test('registro confirmado sin estudio: desde que confirmó', () => {
  assert.deepEqual(pasoDeAlta(alta({ emailConfirmadoEn: hace(29) })), { paso: 'estudio_sin_crear', desde: hace(29) });
});

test('un fallo al montar pesa más que «confirmado», y tener estudio más que todo', () => {
  assert.equal(pasoDeAlta(alta({ emailConfirmadoEn: hace(29), errorEstudioEn: hace(28) })).paso, 'error_estudio');
  assert.equal(pasoDeAlta(alta({ errorEstudioEn: hace(28), estudioCreadoEn: hace(2) })).paso, 'terminada');
});

test('con sesión: paso 1 hasta que pasa al plan', () => {
  assert.equal(pasoDeAlta(alta({ origen: 'con_sesion' })).paso, 'formulario_estudio');
  assert.deepEqual(pasoDeAlta(alta({ origen: 'con_sesion', planEn: hace(29) })), { paso: 'formulario_plan', desde: hace(29) });
});

// ── Quién recibe el correo ──────────────────────────────────────────────────

test('a las 24 h se envía, con el paso en que se quedó', () => {
  assert.deepEqual(decidirRecordatorio(alta(), AHORA), { enviar: true, paso: 'email_sin_confirmar' });
  assert.deepEqual(
    decidirRecordatorio(alta({ emailConfirmadoEn: hace(29) }), AHORA),
    { enviar: true, paso: 'estudio_sin_crear' },
  );
});

test('antes de las 24 h todavía no, y no es definitivo', () => {
  assert.deepEqual(
    decidirRecordatorio(alta({ iniciadaEn: hace(23.9) }), AHORA),
    { enviar: false, motivo: 'aun_no', definitivo: false },
  );
});

test('las 24 h cuentan desde que EMPEZÓ, no desde el último paso', () => {
  // Confirmó hace 1 h, pero empezó hace 30: ya toca.
  assert.equal(decidirRecordatorio(alta({ emailConfirmadoEn: hace(1) }), AHORA).enviar, true);
});

test('pasada una semana no se escribe: definitivo', () => {
  assert.deepEqual(
    decidirRecordatorio(alta({ iniciadaEn: hace(7 * 24 + 1) }), AHORA),
    { enviar: false, motivo: 'fuera_de_plazo', definitivo: true },
  );
});

test('quien ya terminó no recibe nada', () => {
  const d = decidirRecordatorio(alta({ estudioCreadoEn: hace(5) }), AHORA);
  assert.deepEqual(d, { enviar: false, motivo: 'terminada', definitivo: true });
});

test('quien ya trabaja en un estudio (invitada mientras tanto) no es un alta', () => {
  assert.deepEqual(
    decidirRecordatorio(alta({ esEquipo: true }), AHORA),
    { enviar: false, motivo: 'es_equipo', definitivo: true },
  );
});

test('con sesión y sin escribir ni el nombre: ningún correo (no ha dicho que quiera un estudio)', () => {
  assert.deepEqual(
    decidirRecordatorio(alta({ origen: 'con_sesion' }), AHORA),
    { enviar: false, motivo: 'sin_intencion', definitivo: false },
  );
  assert.deepEqual(
    decidirRecordatorio(alta({ origen: 'con_sesion', planEn: hace(29) }), AHORA),
    { enviar: true, paso: 'formulario_plan' },
  );
});

test('sin email no se puede escribir', () => {
  assert.deepEqual(
    decidirRecordatorio(alta({ email: null }), AHORA),
    { enviar: false, motivo: 'sin_email', definitivo: true },
  );
});

// ── Un solo correo por persona ──────────────────────────────────────────────

test('idempotencia: enviado, reclamado o descartado → nunca otro', () => {
  assert.equal(decidirRecordatorio(alta({ recordatorioEnviadoEn: hace(1) }), AHORA).enviar, false);
  // Otra pasada lo tiene reclamado ahora mismo: esta no lo toca.
  assert.equal(decidirRecordatorio(alta({ recordatorioReclamadoEn: hace(0) }), AHORA).enviar, false);
  assert.equal(decidirRecordatorio(alta({ recordatorioDescartado: 'fuera_de_plazo' }), AHORA).enviar, false);
});

test('idempotencia: quien recibió el aviso ANTIGUO (Inngest) no recibe este', () => {
  assert.deepEqual(
    decidirRecordatorio(alta({ avisadoAntes: true }), AHORA),
    { enviar: false, motivo: 'aviso_antiguo', definitivo: true },
  );
});

test('idempotencia: tras 3 envíos fallidos se deja estar', () => {
  assert.equal(decidirRecordatorio(alta({ recordatorioIntentos: 2 }), AHORA).enviar, true);
  assert.deepEqual(
    decidirRecordatorio(alta({ recordatorioIntentos: 3 }), AHORA),
    { enviar: false, motivo: 'envio_fallido', definitivo: true },
  );
});

test('idempotencia: la clave de Resend es la misma para la misma persona', () => {
  const id = '00000000-0000-0000-0000-000000000001';
  assert.equal(claveIdempotenciaRecordatorio(id), claveIdempotenciaRecordatorio(id));
  assert.notEqual(claveIdempotenciaRecordatorio(id), claveIdempotenciaRecordatorio('00000000-0000-0000-0000-000000000002'));
});

// ── El texto según el paso ──────────────────────────────────────────────────

const BASE = 'https://app.example.com';

test('email sin confirmar: habla de un CÓDIGO nuevo, nunca de un enlace de confirmación', () => {
  const c = contenidoRecordatorio('email_sin_confirmar', alta(), BASE);
  const todo = [c.asunto, c.preheader, c.titular, ...c.parrafos].join(' ');
  assert.match(todo, /código/);
  assert.match(todo, /Reenviar código/);
  assert.doesNotMatch(todo, /enlace de confirmación/i);
  assert.match(c.asunto, /Estudio Aurora/);
});

test('cada paso tiene su texto, distinto de los demás', () => {
  const pasos = ['email_sin_confirmar', 'estudio_sin_crear', 'error_estudio', 'formulario_plan'] as const;
  const asuntos = pasos.map((p) => contenidoRecordatorio(p, alta(), BASE).asunto);
  assert.equal(new Set(asuntos).size, pasos.length);
  assert.match(contenidoRecordatorio('formulario_plan', alta(), BASE).titular, /plan/);
  assert.match(contenidoRecordatorio('error_estudio', alta(), BASE).parrafos.join(' '), /fallo nuestro/);
  assert.match(contenidoRecordatorio('estudio_sin_crear', alta(), BASE).parrafos.join(' '), /Confirmaste tu email/);
});

test('el fallo al montar se cuenta distinto si entró con cuenta (no hay pending_studio que lo monte solo)', () => {
  const registro = contenidoRecordatorio('error_estudio', alta(), BASE).parrafos.join(' ');
  const conSesion = contenidoRecordatorio('error_estudio', alta({ origen: 'con_sesion' }), BASE).parrafos.join(' ');
  assert.match(registro, /solos/);
  assert.match(conSesion, /dos pasos/);
});

test('el botón retoma por /login (sirve en cualquier dispositivo) y sin barra doble', () => {
  for (const p of ['email_sin_confirmar', 'estudio_sin_crear', 'error_estudio', 'formulario_plan'] as const) {
    assert.equal(contenidoRecordatorio(p, alta(), `${BASE}/`).boton.href, `${BASE}/login`);
  }
});

test('sin nombre de estudio no se queda un hueco', () => {
  const c = contenidoRecordatorio('estudio_sin_crear', alta({ estudioNombre: null }), BASE);
  assert.match(c.asunto, /^tu estudio /);
  assert.doesNotMatch([c.asunto, ...c.parrafos].join(' '), /null|undefined/);
});

test('una sola vez, y dicho en el correo', () => {
  for (const p of ['email_sin_confirmar', 'estudio_sin_crear', 'error_estudio', 'formulario_plan'] as const) {
    assert.match(contenidoRecordatorio(p, alta(), BASE).nota, /único correo/);
  }
});

test('el HTML lleva el botón a /login y escapa el nombre que escribió la persona', async () => {
  const { correoAltaSinTerminar } = await import('../emails/tentare/embudo-alta.ts');
  const c = contenidoRecordatorio('estudio_sin_crear', alta({ estudioNombre: 'Pilates <b>Sol</b>' }), BASE);
  const html = correoAltaSinTerminar(c);
  assert.ok(html.includes(`href="${BASE}/login"`));
  assert.ok(!html.includes('<b>Sol</b>'), 'el nombre del estudio llega del usuario: tiene que ir escapado');
  assert.match(html, /empezaste a dar de alta un estudio/);
});

// ── Lo que manda la pantalla ────────────────────────────────────────────────

test('leerEventoProgreso: solo los tres eventos, y el nombre recortado', () => {
  assert.deepEqual(leerEventoProgreso({ evento: 'plan', estudio: '  Aurora  ' }), { evento: 'plan', estudio: 'Aurora' });
  assert.deepEqual(leerEventoProgreso({ evento: 'inicio' }), { evento: 'inicio', estudio: null });
  assert.equal(leerEventoProgreso({ evento: 'terminada' }), null);
  assert.equal(leerEventoProgreso(null), null);
  assert.equal(leerEventoProgreso({ evento: 'plan', estudio: 'x'.repeat(500) })!.estudio!.length, 120);
});

// ── /interno ────────────────────────────────────────────────────────────────

test('interno: «terminó después del correo» solo si el estudio es POSTERIOR al envío', () => {
  const tras = filaParaInterno(alta({ recordatorioEnviadoEn: hace(10), estudioCreadoEn: hace(2) }));
  const antes = filaParaInterno(alta({ recordatorioEnviadoEn: hace(10), estudioCreadoEn: hace(12) }));
  assert.equal(tras.terminoTrasCorreo, true);
  assert.equal(antes.terminoTrasCorreo, false);
  const r = resumirAltas([tras, antes, filaParaInterno(alta())]);
  assert.equal(r.total, 3);
  assert.equal(r.porPaso.terminada, 2);
  assert.equal(r.porPaso.email_sin_confirmar, 1);
  assert.equal(r.correos, 2);
  assert.equal(r.terminaronTrasCorreo, 1);
});

test('altaDesdeFila traduce la fila de la RPC', () => {
  const a = altaDesdeFila({
    auth_user_id: 'u1', email: 'ana@example.com', origen: 'con_sesion', estudio_nombre: null,
    iniciada_en: hace(3), email_confirmado_en: null, plan_en: hace(2), error_estudio_en: null,
    error_estudio_intentos: 0, estudio_creado_en: null, es_equipo: false, avisado_antes: false,
    recordatorio_reclamado_en: null, recordatorio_enviado_en: null, recordatorio_paso: null,
    recordatorio_intentos: 1, recordatorio_descartado: null,
  });
  assert.equal(a.origen, 'con_sesion');
  assert.equal(a.planEn, hace(2));
  assert.equal(a.recordatorioIntentos, 1);
});

// ── La migración y el cron dicen lo mismo que este fichero ───────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const M = readFileSync(join(RAIZ, 'supabase/migrations/20261001190000_altas_estudio_registro.sql'), 'utf8');
const CRON = readFileSync(join(RAIZ, 'supabase/migrations/20261001190100_pg_cron_altas_sin_terminar.sql'), 'utf8');

test('el trigger de auth.users nunca puede tumbar un registro', () => {
  const ini = M.indexOf('function public.altas_estudio_registrar_cuenta');
  const cuerpo = M.slice(ini, M.indexOf('$$;', ini));
  assert.match(cuerpo, /exception when others then/i);
  assert.match(cuerpo, /return new;/);
  assert.match(cuerpo, /jsonb_typeof\(new\.raw_user_meta_data -> 'pending_studio'\) = 'object'/);
  assert.match(M, /after insert on auth\.users/);
});

test('funciones solo para service_role: revoke a anon Y authenticated, grant a service_role', () => {
  for (const f of ['altas_estudio_registrar_cuenta()', 'altas_estudio_detalle(boolean, integer)']) {
    for (const rol of ['public', 'anon', 'authenticated']) {
      assert.ok(M.includes(`revoke execute on function public.${f} from ${rol};`), `${f}: falta revoke a ${rol}`);
    }
    assert.ok(M.includes(`grant execute on function public.${f} to service_role;`), `${f}: falta grant a service_role`);
  }
  assert.match(M, /alter table public\.altas_estudio enable row level security;/);
  assert.match(M, /revoke all on table public\.altas_estudio from public, anon, authenticated;/);
  assert.doesNotMatch(M, /create policy/i);
});

test('el where exists del cron es la MISMA condición que «pendiente» en la función', () => {
  const normal = (s: string) => s.replace(/\s+/g, ' ').trim();
  const condiciones = [
    'recordatorio_enviado_en is null',
    'recordatorio_reclamado_en is null',
    'recordatorio_descartado is null',
    "iniciada_en <= now() - interval '24 hours'",
    "(a.origen = 'registro' or a.plan_en is not null or a.error_estudio_en is not null)",
  ];
  for (const c of condiciones) {
    assert.ok(normal(M).includes(c), `la función no filtra: ${c}`);
    assert.ok(normal(CRON).includes(c), `el cron no filtra: ${c}`);
  }
  assert.match(CRON, /url := 'https:\/\/www\.tentare\.app\/api\/cron\/altas-sin-terminar'/);
  assert.match(CRON, /'23 \* \* \* \*'/);
});
