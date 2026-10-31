import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DETALLES_EMBUDO, DIAS_EMBUDO, FORMATO_LLEGADA, PASOS_DURABLES, PASOS_EMBUDO, VERSIONES_ALTA,
  cohortes, desdeDeLaConsulta, diaCorto, enVentanaDelEmbudo, filaDesdeBd, horasConComa, horasHastaPrimeraClase,
  leerPasoDelNavegador, mediana, normalizarLlegada, rangoDeMeses, resumirActivacion, volvio,
  type FilaEmbudo,
  ALUMNAS_CARGADAS_MINIMO, pasosDeHoy,
} from './embudo.ts';

// El embudo del alta (PR-1 del alta nueva). Lo que se cuenta contra Postgres de
// verdad (grants, RLS, el trigger de auth.users) vive en
// supabase/tests/embudo-alta.test.ts; aquí, la lista cerrada contra la
// migración y todas las cuentas de /interno.

const MIGRACION = readFileSync(new URL('../../supabase/migrations/20261021020248_embudo_alta.sql', import.meta.url), 'utf8');
/**
 * La lista de pasos la rehízo la primera clase (PR-4) para sumar
 * `correo_recibir_reservas`, y «Pon en marcha tu estudio» (PR-5) para sumar
 * `recorrido_visto` y `correo_primera_clase`, y los dos recordatorios de después
 * de la primera clase (31-oct) sumaron `correo_empuje_compartir` y
 * `correo_empuje_alumnas`: el CHECK que vale es el de la ÚLTIMA migración que lo
 * rehízo.
 */
const MIGRACION_PASOS = readFileSync(new URL('../../supabase/migrations/20261031100000_alta_empuje_compartir_y_alumnas.sql', import.meta.url), 'utf8');

/** Los literales de un `check (col in (...))` de la migración. */
function literalesDelCheck(columna: string, migracion = MIGRACION): string[] {
  const m = migracion.match(new RegExp(`${columna}[^;]*?check \\((?:${columna} is null or )?${columna} in \\(([^)]*)\\)`, 's'));
  assert.ok(m, `no encuentro el CHECK de ${columna}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

test('los pasos y los detalles son la MISMA lista cerrada que el CHECK de la migración', () => {
  assert.deepEqual(literalesDelCheck('paso', MIGRACION_PASOS), [...PASOS_EMBUDO]);
  assert.deepEqual(literalesDelCheck('detalle'), [...DETALLES_EMBUDO]);
});

test('las versiones del alta son las del CHECK y las que acepta el trigger', () => {
  assert.deepEqual(literalesDelCheck('version'), [...VERSIONES_ALTA]);
  const trigger = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.altas_estudio_registrar_cuenta'));
  assert.match(trigger, /v_version not in \('v1', 'v2', 'v2_prueba'\)/);
});

test('la forma de la llegada es la misma en TS, en el CHECK y en el trigger', () => {
  const sql = FORMATO_LLEGADA.source;
  assert.ok(MIGRACION.includes(`llegada ~ '${sql}'`), 'el CHECK de llegada no es la misma expresión');
  assert.ok(MIGRACION.includes(`v_llegada !~ '${sql}'`), 'el trigger no normaliza con la misma expresión');
});

test('⚠️ el trigger de auth.users conserva su EXCEPTION: un valor raro nunca rompe un alta', () => {
  const trigger = MIGRACION.slice(
    MIGRACION.indexOf('create or replace function public.altas_estudio_registrar_cuenta'),
    MIGRACION.indexOf('create or replace function public.embudo_activacion_detalle'),
  );
  assert.match(trigger, /exception when others then\s+raise warning 'altas_estudio_registrar_cuenta: %', sqlerrm;/);
  assert.match(trigger, /on conflict \(auth_user_id\) do nothing/);
  // Normaliza ANTES del insert: si el CHECK saltara, la EXCEPTION se llevaría la fila entera.
  assert.ok(trigger.indexOf("v_version := 'v1'") < trigger.indexOf('insert into public.altas_estudio'));
  assert.ok(trigger.indexOf('v_llegada := null') < trigger.indexOf('insert into public.altas_estudio'));
});

test('la lectura es solo de service_role, con los tres pasos explícitos, y en hora de Madrid', () => {
  const firma = 'public.embudo_activacion_detalle(date, boolean)';
  for (const linea of [
    `revoke execute on function ${firma} from public;`,
    `revoke execute on function ${firma} from anon;`,
    `revoke execute on function ${firma} from authenticated;`,
    `grant execute on function ${firma} to service_role;`,
    'revoke all on public.embudo_alta from public, anon, authenticated;',
    'grant all on public.embudo_alta to service_role;',
  ]) assert.ok(MIGRACION.includes(linea), `falta: ${linea}`);
  assert.match(MIGRACION, /create policy exige_doble_factor on public\.embudo_alta as restrictive for all to authenticated/);
  assert.match(MIGRACION, /has_function_privilege\(r, f, 'EXECUTE'\)/);
  // El «hoy» de UTC, ni en el cuerpo ni en un comentario dentro de él (supabase/tests/hoy-de-madrid.test.ts lee prosrc).
  assert.doesNotMatch(MIGRACION, /current_date/i);
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.embudo_activacion_detalle'), MIGRACION.indexOf('-- ── Verificación'));
  assert.doesNotMatch(cuerpo, /::timestamptz(?! as)/, 'un día pasado a instante sin zona cae en UTC');
  assert.match(MIGRACION, /::timestamp at time zone 'Europe\/Madrid'/);
  assert.match(MIGRACION, /dia date not null default public\.hoy_estudio\(\)/);
});

test('sin datos personales en embudo_alta: ni cuenta, ni correo, ni IP, ni texto libre', () => {
  // Las columnas, exactamente estas: una nueva es una decisión, no un descuido.
  const tabla = MIGRACION.slice(MIGRACION.indexOf('create table if not exists public.embudo_alta'), MIGRACION.indexOf('comment on table public.embudo_alta'));
  const columnas = [...tabla.matchAll(/^ {2}([a-z_]+) (?:text|date|timestamptz)\b/gm)].map(m => m[1]);
  assert.deepEqual(columnas, ['studio_id', 'paso', 'dia', 'detalle', 'ocurrido_en']);
  // La función tampoco devuelve correo ni nombres.
  const devuelve = MIGRACION.slice(MIGRACION.indexOf('returns table ('), MIGRACION.indexOf('language sql'));
  assert.doesNotMatch(devuelve, /\bemail text\b|nombre|auth_user_id/);
});

test('el navegador solo puede apuntar «enlace compartido» (con su canal), pedir «Tu estudio» y marcar lo que enseña', () => {
  for (const detalle of DETALLES_EMBUDO) {
    assert.deepEqual(leerPasoDelNavegador({ paso: 'enlace_compartido', detalle }), { paso: 'enlace_compartido', detalle });
  }
  // «Tu estudio» se escribe desde el navegador directo a la base de datos: no hay
  // ruta nuestra donde apuntarlo. Se pide, y la ruta lo comprueba en la base de
  // datos antes de apuntarlo (app/api/alta/paso, `tuEstudioGuardado`).
  assert.deepEqual(leerPasoDelNavegador({ paso: 'config_completada' }), { paso: 'config_completada', detalle: null });
  assert.equal(leerPasoDelNavegador({ paso: 'config_completada', detalle: 'copiar' }), null, 'sin detalle');
  // Lo que ENSEÑA una pantalla (PR-5) también se pide desde ella, sin detalle.
  for (const paso of ['recorrido_visto', 'plan_ensenado'] as const) {
    assert.deepEqual(leerPasoDelNavegador({ paso }), { paso, detalle: null });
    assert.equal(leerPasoDelNavegador({ paso, detalle: 'copiar' }), null, `${paso}: sin detalle`);
  }
  // Lo que se apunta en servidor no se puede apuntar desde el navegador.
  for (const paso of ['clase_reservable', 'panel_abierto', 'correo_cuenta_activa', 'correo_recibir_reservas', 'correo_primera_clase']) {
    assert.equal(leerPasoDelNavegador({ paso, detalle: 'copiar' }), null, paso);
    assert.equal(leerPasoDelNavegador({ paso }), null, paso);
  }
  assert.equal(leerPasoDelNavegador({ paso: 'enlace_compartido' }), null);
  assert.equal(leerPasoDelNavegador({ paso: 'enlace_compartido', detalle: 'instagram' }), null);
  assert.equal(leerPasoDelNavegador({ paso: 'enlace_compartido', detalle: 'COPIAR' }), null);
  assert.equal(leerPasoDelNavegador(null), null);
  assert.equal(leerPasoDelNavegador('enlace_compartido'), null);
});

test('un estudio se apunta sus primeros 40 días, y con una fecha ilegible no', () => {
  const ahora = new Date('2026-10-21T10:00:00Z');
  const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString();
  assert.equal(DIAS_EMBUDO, 40);
  assert.equal(enVentanaDelEmbudo(hace(0), ahora), true);
  assert.equal(enVentanaDelEmbudo(hace(36), ahora), true, 'el d30 mira hasta el día 36');
  assert.equal(enVentanaDelEmbudo(hace(40), ahora), true);
  assert.equal(enVentanaDelEmbudo(hace(41), ahora), false);
  assert.equal(enVentanaDelEmbudo(new Date(ahora.getTime() + 3_600_000).toISOString(), ahora), true, 'un reloj por delante');
  assert.equal(enVentanaDelEmbudo(null, ahora), false);
  assert.equal(enVentanaDelEmbudo('no es una fecha', ahora), false);
});

test('la llegada se normaliza como en el trigger y lo que no tiene su forma se tira', () => {
  assert.equal(normalizarLlegada('hero'), 'hero');
  assert.equal(normalizarLlegada(' Precio '), 'precio');
  assert.equal(normalizarLlegada('/funcionalidades/plazas-fijas'), '/funcionalidades/plazas-fijas');
  assert.equal(normalizarLlegada('cta final'), null);
  assert.equal(normalizarLlegada('x'.repeat(81)), null);
  assert.equal(normalizarLlegada(''), null);
  assert.equal(normalizarLlegada(42), null);
});

test('la mediana es la de percentile_cont(0.5): con pares, la media de las dos del centro', () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([5]), 5);
  assert.equal(mediana([30, 10, 20]), 20);
  assert.equal(mediana([40, 10, 20, 30]), 25);
});

test('horas hasta la primera clase: sin una de las dos marcas no hay cifra', () => {
  assert.equal(horasHastaPrimeraClase({ estudioCreadoEn: '2026-10-01T10:00:00Z', primeraClaseEn: '2026-10-02T10:00:00Z' }), 24);
  assert.equal(horasHastaPrimeraClase({ estudioCreadoEn: '2026-10-01T10:00:00Z', primeraClaseEn: null }), null);
  assert.equal(horasHastaPrimeraClase({ estudioCreadoEn: null, primeraClaseEn: '2026-10-02T10:00:00Z' }), null);
});

// ── Filas de prueba ─────────────────────────────────────────────────────────

let n = 0;
function fila(o: Partial<FilaEmbudo> & { diaAlta: string }): FilaEmbudo {
  n += 1;
  return {
    studioId: `st-${n}`,
    semana: o.diaAlta,
    version: 'v1',
    llegada: null,
    altaIniciadaEn: null,
    emailConfirmadoEn: null,
    estudioCreadoEn: `${o.diaAlta}T10:00:00Z`,
    tieneTipoClase: false,
    tieneClase: false,
    primeraClaseEn: null,
    tieneTarifaActiva: false,
    primeraReservaEn: null,
    pasos: {},
    diasPanel: [],
    medidoDesde: {},
    ...o,
  };
}
const masHoras = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString();

test('«vuelven»: solo con la ventana CERRADA y medida; si no, null, nunca un no', () => {
  const f = fila({ diaAlta: '2026-11-02', diasPanel: [0, 1, 9] });
  const medido = '2026-11-01';
  // d1: el día 1 es el 3-nov; hoy 3-nov aún no ha terminado.
  assert.equal(volvio(f, 'd1', '2026-11-03', medido), null);
  assert.equal(volvio(f, 'd1', '2026-11-04', medido), true);
  // d7: del 9 al 15-nov. Aunque ya volvió el día 9, con la ventana abierta no se cuenta.
  assert.equal(volvio(f, 'd7', '2026-11-12', medido), null);
  assert.equal(volvio(f, 'd7', '2026-11-16', medido), true);
  // d30: del 2 al 8-dic, sin panel en esos días → no.
  assert.equal(volvio(f, 'd30', '2026-12-09', medido), false);
  // Sin medir, o con la ventana empezada antes de medir: no se sabe.
  assert.equal(volvio(f, 'd1', '2026-11-04', null), null);
  assert.equal(volvio(f, 'd1', '2026-11-04', '2026-11-04'), null);
});

test('la cohorte «antes» cuadra con la auditoría: 11 · 4 con clase · 2 en 24 h · 23,9 h · 2 con reserva · d1/d7/d30 «—»', () => {
  // Las cifras reales del 21-oct (01-estado-actual.md, columna C), con horas inventadas que dan su mediana.
  const horas = [5, 18.5, 29.3, 40];
  const filas = Array.from({ length: 11 }, (_, i) => {
    const diaAlta = i < 4 ? '2026-09-10' : '2026-10-08';
    const base = fila({ diaAlta });
    if (i >= 4) return base;
    return {
      ...base,
      tieneClase: true,
      primeraClaseEn: masHoras(base.estudioCreadoEn!, horas[i]),
      primeraReservaEn: i < 2 ? masHoras(base.estudioCreadoEn!, i === 0 ? 50 : 300) : null,
    };
  });
  const [antes, ...resto] = cohortes(filas, '2026-10-21');
  assert.equal(antes.etiqueta, 'Antes del alta nueva');
  assert.equal(antes.detalle, 'sep-oct');
  assert.equal(antes.altas, 11);
  assert.equal(antes.conClase, 4);
  assert.equal(antes.en24h, 2);
  assert.equal(horasConComa(antes.medianaHoras!), '23,9 h');
  assert.equal(antes.nMediana, 4);
  assert.equal(antes.primeraReserva, 2);
  // `panel_abierto` no se medía: «—» y no 0.
  assert.deepEqual([antes.d1, antes.d7, antes.d30], [null, null, null]);
  // Sin altas nuevas todavía: las dos filas vacías de la maqueta, todo «—».
  assert.deepEqual(resto.map(r => r.etiqueta), ['Semana 1 con el alta nueva', 'Semana 2']);
  for (const r of resto) {
    assert.deepEqual([r.altas, r.conClase, r.en24h, r.medianaHoras, r.primeraReserva, r.d7], [null, null, null, null, null, null]);
  }
});

test('una clase de antes del 13-sep (sin hora) cuenta como «con clase» y no entra en la mediana', () => {
  const filas = [
    fila({ diaAlta: '2026-09-01', tieneClase: true }),
    fila({ diaAlta: '2026-10-01', tieneClase: true, primeraClaseEn: '2026-10-01T20:00:00Z' }),
    fila({ diaAlta: '2026-10-02' }),
  ];
  const r = resumirActivacion(filas, '2026-10-21');
  assert.equal(r.tarjetas.conClase, 2);
  assert.equal(r.tarjetas.nMediana, 1);
  assert.equal(r.tarjetas.medianaHorasPrimeraClase, 10);
  assert.equal(r.tarjetas.clasesSinHora, 1);
  assert.equal(r.cohortes[0].conClase, 2);
  assert.equal(r.cohortes[0].nMediana, 1);
  assert.equal(filaDesdeBd({ semana: '2026-09-01', dia_alta: '2026-09-01', tiene_clase: true })?.tieneClase, true);
});

test('las semanas con el alta nueva se numeran desde la primera y la de antes no se mezcla', () => {
  const filas = [
    fila({ diaAlta: '2026-10-10' }),
    fila({ diaAlta: '2026-10-27', semana: '2026-10-26', version: 'v2' }),
    fila({ diaAlta: '2026-10-29', semana: '2026-10-26', version: 'v2' }),
    // Una semana sin altas en medio: la siguiente es la 3, no la 2.
    fila({ diaAlta: '2026-11-11', semana: '2026-11-09', version: 'v2' }),
    // Un alta sin estudio no es una fila de la tabla.
    fila({ diaAlta: '2026-11-11', semana: '2026-11-09', version: 'v2', studioId: null, estudioCreadoEn: null }),
  ];
  const c = cohortes(filas, '2026-11-20');
  assert.deepEqual(c.map(x => [x.etiqueta, x.altas]), [
    ['Antes del alta nueva', 1],
    ['Semana 1 con el alta nueva', 2],
    ['Semana 3', 1],
  ]);
  assert.equal(c[1].detalle, 'desde el 26 oct');
});

test('d1 de una cohorte: cuenta solo los estudios con su día 1 ya pasado y medido', () => {
  const medidoDesde = { panel_abierto: '2026-10-22' };
  const filas = [
    fila({ diaAlta: '2026-10-26', semana: '2026-10-26', version: 'v2', diasPanel: [0, 1], medidoDesde }),
    fila({ diaAlta: '2026-10-27', semana: '2026-10-26', version: 'v2', diasPanel: [0], medidoDesde }),
    // Su día 1 es hoy: aún no cuenta ni como sí ni como no.
    fila({ diaAlta: '2026-10-28', semana: '2026-10-26', version: 'v2', diasPanel: [0, 1], medidoDesde }),
  ];
  const [, semana] = cohortes(filas, '2026-10-29');
  assert.deepEqual(semana.d1, { si: 1, de: 2 });
  assert.equal(semana.d7, null, 'nadie ha llegado al día 13');
});

test('el embudo: arriba las altas, abajo los estudios; un paso nuevo sin medir es «—»', () => {
  const hoy = '2026-10-21';
  const filas = [
    // Un alta que no llegó a estudio.
    fila({ diaAlta: '2026-10-05', studioId: null, estudioCreadoEn: null, altaIniciadaEn: '2026-10-05T08:00:00Z' }),
    fila({ diaAlta: '2026-10-06', altaIniciadaEn: '2026-10-06T08:00:00Z', emailConfirmadoEn: '2026-10-06T08:05:00Z', tieneTipoClase: true }),
    fila({
      diaAlta: '2026-10-07', altaIniciadaEn: '2026-10-07T08:00:00Z', emailConfirmadoEn: '2026-10-07T08:05:00Z',
      tieneTipoClase: true, tieneTarifaActiva: true, tieneClase: true, primeraClaseEn: '2026-10-07T12:00:00Z', primeraReservaEn: '2026-10-09T12:00:00Z',
    }),
    // Del 21-ago: fuera de los 60 días (cuenta en la cohorte «antes», no en el embudo).
    fila({ diaAlta: '2026-08-21' }),
  ];
  const r = resumirActivacion(filas, hoy);
  assert.equal(r.desde, '2026-08-22');
  assert.deepEqual(r.embudo.altas.map(p => [p.etiqueta, p.n, p.de]), [
    ['Altas iniciadas', 3, 3], ['Email confirmado', 2, 3], ['Con estudio', 2, 3],
  ]);
  assert.equal(r.embudo.altas[0].desde, '2026-10-01', 'altas_estudio no existía antes del 1-oct: lo dice');
  assert.equal(r.embudo.nEstudios, 2);
  const porId = Object.fromEntries(r.embudo.estudios.map(p => [p.id, p]));
  assert.deepEqual([porId.tipo_clase.n, porId.clase_programada.n, porId.tarifa_activa.n, porId.primera_reserva.n], [2, 1, 1, 1]);
  for (const id of ['config_completada', 'clase_reservable', 'enlace_compartido']) {
    assert.equal(porId[id].fuente, 'nuevo');
    assert.equal(porId[id].n, null, `${id} no se medía: «—», no 0`);
  }
  assert.equal(r.tarjetas.estudios, 2);
  assert.equal(r.tarjetas.conClase, 1);
  assert.equal(r.tarjetas.reservaEn7Dias, 1);
  assert.equal(r.tarjetas.vuelvenD7, null);
  assert.equal(r.tarjetas.panelMedidoDesde, null);
});

test('un paso nuevo se cuenta solo sobre los estudios nacidos cuando ya se medía', () => {
  const medidoDesde = { clase_reservable: '2026-10-22', enlace_compartido: '2026-10-25' };
  const filas = [
    // De antes de medir, aunque lo hiciera después: fuera de la cuenta.
    fila({ diaAlta: '2026-10-20', medidoDesde, pasos: { clase_reservable: '2026-10-23T09:00:00Z' } }),
    fila({ diaAlta: '2026-10-22', medidoDesde, pasos: { clase_reservable: '2026-10-22T11:00:00Z' } }),
    fila({ diaAlta: '2026-10-23', medidoDesde }),
  ];
  const porId = Object.fromEntries(resumirActivacion(filas, '2026-10-30').embudo.estudios.map(p => [p.id, p]));
  assert.deepEqual([porId.clase_reservable.n, porId.clase_reservable.de, porId.clase_reservable.desde], [1, 2, '2026-10-22']);
  // Medido, pero ningún estudio nacido desde entonces: «—».
  assert.deepEqual([porId.enlace_compartido.n, porId.enlace_compartido.desde], [null, '2026-10-25']);
});

test('una fila de la RPC se lee entera, y lo que no la sitúa en el tiempo se descarta', () => {
  const f = filaDesdeBd({
    studio_id: 'st-1', semana: '2026-10-19', dia_alta: '2026-10-21', version: 'v2', llegada: 'hero',
    alta_iniciada_en: '2026-10-21T08:00:00+00:00', email_confirmado_en: null, estudio_creado_en: '2026-10-21T08:10:00+00:00',
    tiene_tipo_clase: true, tiene_clase: false, primera_clase_en: null, tiene_tarifa_activa: false, primera_reserva_en: null,
    pasos: { clase_reservable: '2026-10-21T09:00:00+00:00', inventado: 'x' },
    dias_panel: [0, 1, '3'], medido_desde: { panel_abierto: '2026-10-21', otro: '2026-10-01' },
  });
  assert.ok(f);
  assert.equal(f.version, 'v2');
  assert.deepEqual(f.pasos, { clase_reservable: '2026-10-21T09:00:00+00:00' });
  assert.deepEqual(f.diasPanel, [0, 1, 3]);
  assert.deepEqual(f.medidoDesde, { panel_abierto: '2026-10-21' });
  assert.equal(filaDesdeBd({ ...f, semana: null }), null);
  assert.equal(filaDesdeBd(null), null);
  assert.equal(filaDesdeBd({ semana: '2026-10-19', dia_alta: '2026-10-21', version: 'v9' })?.version, 'v1');
});

test('la consulta pide desde el inicio del «antes» o desde la ventana, lo que sea anterior', () => {
  assert.equal(desdeDeLaConsulta('2026-10-21'), '2026-08-22');
  assert.equal(desdeDeLaConsulta('2026-12-31'), '2026-08-22', 'el «antes» no encoge con los días');
});

test('las fechas se dicen en castellano', () => {
  assert.equal(diaCorto('2026-10-27'), '27 oct');
  assert.equal(rangoDeMeses(['2026-10-01', '2026-09-30']), 'sep-oct');
  assert.equal(rangoDeMeses(['2026-10-01']), 'oct');
  assert.equal(rangoDeMeses([]), null);
  assert.equal(horasConComa(23.8697), '23,9 h');
  assert.equal(horasConComa(5), '5,0 h');
});

test('las marcas de «ya se enseñó» valen pase el día que pase; las medidas, no', () => {
  assert.deepEqual([...PASOS_DURABLES].sort(), [
    'correo_empuje_alumnas', 'correo_empuje_compartir', 'correo_primera_clase', 'plan_ensenado', 'recorrido_visto',
  ]);
  for (const p of PASOS_DURABLES) assert.ok((PASOS_EMBUDO as readonly string[]).includes(p), p);
  for (const medida of ['panel_abierto', 'clase_reservable', 'enlace_compartido'] as const) {
    assert.ok(!PASOS_DURABLES.includes(medida), `${medida} es una medida de cómo arranca: con su ventana`);
  }
});

// ── «Cómo está hoy»: alumnas y Stripe (31-oct-2026) ─────────────────────────

const extra = (o: Partial<{ conStripe: boolean; alumnasCargadas: number; alumnasConCuenta: number }> = {}) =>
  ({ conStripe: false, alumnasCargadas: 0, alumnasConCuenta: 0, ...o });

test('«cómo está hoy»: cuántos estudios tienen alumnas cargadas, alumnas en la app y Stripe', () => {
  const filas = [
    fila({ diaAlta: '2026-10-28', extra: extra({ alumnasCargadas: 61, alumnasConCuenta: 61 }) }),
    fila({ diaAlta: '2026-10-28', extra: extra({ alumnasCargadas: ALUMNAS_CARGADAS_MINIMO, conStripe: true }) }),
    fila({ diaAlta: '2026-10-28', extra: extra({ alumnasCargadas: ALUMNAS_CARGADAS_MINIMO - 1, alumnasConCuenta: 1 }) }),
    fila({ diaAlta: '2026-10-28', extra: extra() }),
  ];
  const por = Object.fromEntries(pasosDeHoy(filas).map(p => [p.id, p]));
  assert.deepEqual([por.alumnas_cargadas.n, por.alumnas_cargadas.de], [2, 4], 'cinco o más; una de prueba no cuenta');
  assert.deepEqual([por.alumnas_en_app.n, por.alumnas_en_app.de], [2, 4]);
  assert.deepEqual([por.stripe_conectado.n, por.stripe_conectado.de], [1, 4]);
  for (const p of Object.values(por)) assert.equal(p.nota, 'hoy', 'estado de hoy, sin fecha de cuándo ocurrió');
});

test('sin poder leer alumnas ni Stripe es «—», nunca 0; y se cuenta solo sobre los que sí se leyeron', () => {
  const sinLeer = pasosDeHoy([fila({ diaAlta: '2026-10-28' }), fila({ diaAlta: '2026-10-28' })]);
  for (const p of sinLeer) assert.deepEqual([p.n, p.de], [null, null], p.id);
  const mezcla = pasosDeHoy([fila({ diaAlta: '2026-10-28', extra: extra({ conStripe: true }) }), fila({ diaAlta: '2026-10-28' })]);
  const stripe = mezcla.find(p => p.id === 'stripe_conectado')!;
  assert.deepEqual([stripe.n, stripe.de], [1, 1]);
});

test('el embudo de /interno enseña los tres pasos antes de la primera reserva', () => {
  const filas = [fila({ diaAlta: '2026-10-28', extra: extra({ alumnasCargadas: 10 }) })];
  const ids = resumirActivacion(filas, '2026-10-30').embudo.estudios.map(p => p.id);
  assert.deepEqual(ids.slice(ids.indexOf('enlace_compartido')), [
    'enlace_compartido', 'alumnas_cargadas', 'alumnas_en_app', 'stripe_conectado', 'primera_reserva',
  ]);
});
