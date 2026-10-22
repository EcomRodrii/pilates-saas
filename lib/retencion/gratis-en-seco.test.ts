import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CODIGOS_AVISO_GRATIS, MAX_MEDICIONES_POR_PASADA, TEXTO_AVISO_GRATIS, avisosDeGratis, cabeEnLaPasada, comoInformeGratis, grupoPropuesto,
  informeGratis, seMideHoy, type EntradaInformeGratis, type FichaEstudio, type FilaDelDia, type MiembroDelGrupo,
} from './gratis-en-seco.ts';
import { estadoDeLoGuardado, type UsoGratis } from '../billing/plan-gratis.ts';
import { medirGratisEnSeco } from './gratis-en-seco-servidor.ts';

// El plan gratis medido en seco (bajas, PR-3 y PR-4 en modo informe): quién se
// mide, el grupo de la dueña con la regla propuesta y el registro del día.

const HOY = '2026-10-16';
const uso = (alumnasActivas: number, reservas30Dias = 0): UsoGratis => ({ alumnasActivas, reservas30Dias });
const medido = (studioId: string, a: number, r: number, excedidoDesde: string | null = null) =>
  ({ studioId, alumnasActivas: a, reservas30Dias: r, excedidoDesde, medidoEn: `${HOY}T06:00:00Z` });
const gratis = (estado: MiembroDelGrupo['estado'] = 'GRATIS', motivo: string | null = null, esDemo = false): MiembroDelGrupo => ({ estado, motivo, esDemo });

function entrada(o: Partial<EntradaInformeGratis> = {}): EntradaInformeGratis {
  return {
    studioId: 'b', estadoSuscripcion: 'gratis', hoy: HOY, medidoEn: `${HOY}T10:00:00Z`,
    grupoDeHoy: ['b'], usos: new Map([['b', uso(10, 20)]]), guardado: [], miembros: new Map([['b', gratis()]]),
    ...o,
  };
}

// ─── Quién se mide ───────────────────────────────────────────────────────────

const fila = (o: Partial<FilaDelDia> = {}): FilaDelDia => ({ studio_id: 'b', estado: 'GRATIS', motivo: null, paga: false, avisos: [], gratis: null, ...o });
const ficha = (o: Partial<FichaEstudio> = {}): FichaEstudio => ({ id: 'b', owner_auth_user_id: 'u', subscription_status: 'gratis', es_demo: false, ...o });

test('se mide el gratis que no paga, no es demo, tiene su fila del día bien y aún sin medir', () => {
  assert.equal(seMideHoy(fila(), ficha()), true);
  assert.equal(seMideHoy(fila({ estado: 'SUSPENDIDO', motivo: 'limite_gratis' }), ficha({ subscription_status: 'gratis_cerrado' })), true);
  assert.equal(seMideHoy(fila({ estado: 'INACTIVO', motivo: 'abandono' }), ficha()), true);
});

test('quien paga nunca se mide: ni por su plan ni por el de su cadena', () => {
  assert.equal(seMideHoy(fila({ paga: true, estado: 'ACTIVO_PAGO' }), ficha({ subscription_status: 'active' })), false);
  // Una sede con 'gratis' cuya cadena paga: la fila del día dice que paga.
  assert.equal(seMideHoy(fila({ paga: true, estado: 'ACTIVO_PAGO' }), ficha()), false);
  // Sin saber si paga (fila sin calcular), tampoco.
  assert.equal(seMideHoy(fila({ paga: null }), ficha()), false);
});

test('ni las demos, ni lo que no es gratis, ni un ERROR, ni dos veces el mismo día', () => {
  assert.equal(seMideHoy(fila(), ficha({ es_demo: true })), false);
  assert.equal(seMideHoy(fila(), ficha({ subscription_status: 'trialing' })), false);
  assert.equal(seMideHoy(fila(), ficha({ subscription_status: 'canceled' })), false);
  assert.equal(seMideHoy(fila({ estado: 'ERROR', paga: null }), ficha()), false);
  assert.equal(seMideHoy(fila({ gratis: { version: 1 } }), ficha()), false);
  assert.equal(seMideHoy(fila(), undefined), false);
});

test('el tope por pasada: lo que no cabe espera a la siguiente, y el primero siempre cabe', () => {
  assert.equal(cabeEnLaPasada(3, 0, 2), true, 'una dueña con más estudios que el tope se mide igual');
  assert.equal(cabeEnLaPasada(1, MAX_MEDICIONES_POR_PASADA - 1), true);
  assert.equal(cabeEnLaPasada(2, MAX_MEDICIONES_POR_PASADA - 1), false);
  assert.equal(cabeEnLaPasada(0, MAX_MEDICIONES_POR_PASADA + 5), true, 'si ya está todo medido, no gasta');
});

// ─── PR-4: el grupo de la dueña con la regla propuesta ───────────────────────

test('regla propuesta: fuera los eliminados, los suspendidos por abandono y las demos', () => {
  const miembros = new Map<string, MiembroDelGrupo>([
    ['b', gratis()],
    ['eliminado', gratis('ELIMINADO')],
    ['abandonado', gratis('SUSPENDIDO', 'abandono')],
    ['demo', gratis('GRATIS', null, true)],
  ]);
  const g = grupoPropuesto('b', ['b', 'eliminado', 'abandonado', 'demo'], miembros);
  assert.deepEqual(g.ids, ['b']);
  assert.deepEqual(g.fuera, [{ id: 'eliminado', motivo: 'eliminado' }, { id: 'abandonado', motivo: 'abandono' }, { id: 'demo', motivo: 'demo' }]);
  assert.deepEqual(g.sinSituacion, []);
});

test('regla propuesta: trocear sigue sin funcionar (en margen, cerrado por límite, en baja o inactivo siguen dentro)', () => {
  const miembros = new Map<string, MiembroDelGrupo>([
    ['b', gratis()],
    ['margen', gratis('GRATIS_EN_MARGEN')],
    ['cerrado', gratis('SUSPENDIDO', 'limite_gratis')],
    ['baja', gratis('EN_BAJA', 'limite_gratis')],
    ['inactivo', gratis('INACTIVO', 'abandono')],
  ]);
  const g = grupoPropuesto('b', ['b', 'margen', 'cerrado', 'baja', 'inactivo'], miembros);
  assert.deepEqual(g.ids, ['b', 'margen', 'cerrado', 'baja', 'inactivo']);
  assert.deepEqual(g.fuera, []);
});

test('regla propuesta: sin la situación de un estudio de la dueña no se decide', () => {
  const g = grupoPropuesto('b', ['b', 'x', 'y'], new Map([['b', gratis()], ['y', gratis('ERROR')]]));
  assert.deepEqual(g.sinSituacion, ['x', 'y']);
});

// ─── PR-3: el registro del día ───────────────────────────────────────────────

test('un gratis que el gate nunca midió: lo medido, su fase, y que el gate no lo tiene', () => {
  const i = informeGratis(entrada());
  assert.deepEqual(i.propio, { alumnas: 10, reservas: 20 });
  assert.deepEqual(i.actual, { grupo: ['b'], alumnas: 10, reservas: 20, excedido_desde: null, fase: 'DENTRO', cierra_el: null });
  assert.equal(i.guardado?.fase, 'SIN_MEDIR');
  assert.equal(i.coincide, false);
  assert.equal(i.grupo_difiere, false);
  assert.deepEqual(i.ambiguo, []);
  assert.deepEqual(avisosDeGratis(i), ['gratis_lo_mediria_el_barrido']);
});

test('lo medido coincide con lo guardado: misma fase y misma fecha', () => {
  const i = informeGratis(entrada({ guardado: [medido('b', 9, 18)] }));
  assert.equal(i.coincide, true);
  assert.deepEqual(avisosDeGratis(i), []);
  // El gate tiene cifras y dice otra fase: se apunta como diferencia (no como «sin medir»).
  const otra = informeGratis(entrada({ usos: new Map([['b', uso(130)]]), guardado: [medido('b', 10, 0)] }));
  assert.deepEqual([otra.actual?.fase, otra.guardado?.fase, otra.coincide], ['CERCA', 'DENTRO', false]);
  assert.deepEqual(avisosDeGratis(otra), ['gratis_difiere_del_gate']);
});

test('en margen y cerrado: desde cuándo según la regla de hoy, y si el barrido lo cerraría', () => {
  const margen = informeGratis(entrada({ usos: new Map([['b', uso(160)]]), guardado: [medido('b', 160, 0, '2026-10-10')] }));
  assert.deepEqual([margen.actual?.fase, margen.actual?.excedido_desde, margen.actual?.cierra_el], ['MARGEN', '2026-10-10', '2026-11-09']);
  assert.equal(margen.coincide, true);
  const cierra = informeGratis(entrada({ usos: new Map([['b', uso(160)]]), guardado: [medido('b', 160, 0, '2026-09-01')] }));
  assert.equal(cierra.actual?.fase, 'CERRADO');
  assert.ok(avisosDeGratis(cierra).includes('gratis_se_cerraria'));
  // Ya cerrado en la base: cerrado (como en el gate), y no hay nada más que cerrar.
  const yaCerrado = informeGratis(entrada({ estadoSuscripcion: 'gratis_cerrado', usos: new Map([['b', uso(5)]]), guardado: [medido('b', 5, 0)] }));
  assert.deepEqual([yaCerrado.actual?.fase, yaCerrado.guardado?.fase], ['CERRADO', 'CERRADO']);
  assert.ok(!avisosDeGratis(yaCerrado).includes('gratis_se_cerraria'));
});

test('el número del informe es el que guardaría el gate: medido, guardado y vuelto a leer da lo mismo', () => {
  const usos = new Map([['a', uso(100, 120)], ['b', uso(60, 140)]]);
  const i = informeGratis(entrada({ grupoDeHoy: ['b', 'a'], usos, guardado: [], miembros: new Map([['a', gratis()], ['b', gratis()]]) }));
  // Lo que `refrescarUsoGratis` guarda en CADA estudio del grupo: sus cifras y la fecha del grupo.
  const guardadoTrasMedir = ['a', 'b'].map(id => medido(id, usos.get(id)!.alumnasActivas, usos.get(id)!.reservas30Dias, i.actual!.excedido_desde));
  const leido = estadoDeLoGuardado(guardadoTrasMedir, 2, HOY);
  assert.deepEqual([i.actual?.alumnas, i.actual?.reservas], [160, 260]);
  assert.deepEqual(leido.estado.uso, { alumnasActivas: 160, reservas30Dias: 260 });
  assert.equal(leido.estado.fase, i.actual?.fase);
  assert.equal(leido.excedidoDesde, i.actual?.excedido_desde);
});

test('nace cerrado (hoy) frente a arranca limpio (propuesta): la hermana abandonada con un exceso viejo', () => {
  const i = informeGratis(entrada({
    grupoDeHoy: ['b', 'a'],
    usos: new Map([['a', uso(0)], ['b', uso(10)]]),
    guardado: [medido('a', 0, 0, '2026-08-01')],
    miembros: new Map([['a', gratis('SUSPENDIDO', 'abandono')], ['b', gratis()]]),
  }));
  assert.equal(i.actual?.fase, 'CERRADO', 'con la regla de hoy, el estudio nuevo hereda el cierre de la abandonada');
  assert.deepEqual([i.propuesta?.fase, i.propuesta?.excedido_desde, i.propuesta?.grupo], ['DENTRO', null, ['b']]);
  assert.deepEqual(i.propuesta?.fuera, [{ id: 'a', motivo: 'abandono' }]);
  assert.equal(i.grupo_difiere, true);
  // El gate, con lo guardado, ya lo daría por cerrado (el margen de la hermana se acabó, se mida o no).
  assert.deepEqual([i.guardado?.fase, i.coincide], ['CERRADO', true]);
  assert.deepEqual(avisosDeGratis(i), ['gratis_se_cerraria', 'grupo_dueña_difiere']);
});

test('trocear con la hermana en margen: hereda su fecha con las dos reglas, y el grupo no cambia', () => {
  const i = informeGratis(entrada({
    grupoDeHoy: ['b', 'a'],
    usos: new Map([['a', uso(140)], ['b', uso(20)]]),
    guardado: [medido('a', 140, 0, '2026-10-10'), medido('b', 20, 0, '2026-10-10')],
    miembros: new Map([['a', gratis('GRATIS_EN_MARGEN')], ['b', gratis('GRATIS_EN_MARGEN')]]),
  }));
  assert.deepEqual([i.actual?.fase, i.actual?.excedido_desde], ['MARGEN', '2026-10-10']);
  assert.deepEqual([i.propuesta?.fase, i.propuesta?.excedido_desde], ['MARGEN', '2026-10-10']);
  assert.equal(i.grupo_difiere, false);
  assert.ok(!avisosDeGratis(i).includes('grupo_dueña_difiere'));
});

test('la demo de la dueña cuenta hoy y no en la propuesta', () => {
  const i = informeGratis(entrada({
    grupoDeHoy: ['b', 'demo'],
    usos: new Map([['b', uso(100)], ['demo', uso(60)]]),
    miembros: new Map([['b', gratis()], ['demo', gratis('GRATIS', null, true)]]),
  }));
  assert.deepEqual([i.actual?.alumnas, i.actual?.fase], [160, 'MARGEN']);
  assert.deepEqual([i.propuesta?.alumnas, i.propuesta?.fase], [100, 'DENTRO']);
  assert.ok(avisosDeGratis(i).includes('grupo_dueña_difiere'));
});

test('una lectura fallida se apunta como ambigua y no se inventa nada', () => {
  // Falla la medición de la hermana: sin cifras del grupo, ni fase ni fecha.
  const fallo = informeGratis(entrada({
    grupoDeHoy: ['b', 'a'], usos: new Map([['a', null], ['b', uso(10)]]),
    miembros: new Map([['a', gratis()], ['b', gratis()]]),
  }));
  assert.equal(fallo.actual, null);
  assert.equal(fallo.propuesta, null);
  assert.equal(fallo.coincide, null);
  assert.deepEqual(fallo.propio, { alumnas: 10, reservas: 0 });
  assert.deepEqual(fallo.ambiguo, ['medicion_fallida']);
  assert.deepEqual(avisosDeGratis(fallo), ['gratis_medicion_ambigua']);

  // Sin poder leer lo guardado no se sabe desde cuándo se pasó: nada de fechas.
  const sinGuardado = informeGratis(entrada({ guardado: null }));
  assert.deepEqual([sinGuardado.actual, sinGuardado.guardado, sinGuardado.ambiguo], [null, null, ['guardado_sin_leer']]);

  // Sin el grupo de la dueña, solo lo propio.
  const sinGrupo = informeGratis(entrada({ grupoDeHoy: null }));
  assert.deepEqual([sinGrupo.actual, sinGrupo.propuesta, sinGrupo.grupo_difiere, sinGrupo.ambiguo], [null, null, null, ['grupo_sin_leer']]);
  assert.deepEqual(sinGrupo.propio, { alumnas: 10, reservas: 20 });

  // Sin la situación de una hermana, la regla de hoy sí; la propuesta, no.
  const sinSituacion = informeGratis(entrada({ grupoDeHoy: ['b', 'a'], usos: new Map([['a', uso(1)], ['b', uso(1)]]), miembros: new Map([['b', gratis()]]) }));
  assert.equal(sinSituacion.actual?.alumnas, 2);
  assert.deepEqual([sinSituacion.propuesta, sinSituacion.grupo_difiere], [null, null]);
  assert.deepEqual(sinSituacion.ambiguo, ['situacion_de_otro_estudio_sin_saber']);
});

test('cada aviso tiene su frase, y un registro de otra versión no se lee', () => {
  for (const c of CODIGOS_AVISO_GRATIS) assert.ok(TEXTO_AVISO_GRATIS[c], c);
  assert.equal(comoInformeGratis(null), null);
  assert.equal(comoInformeGratis({ version: 2, medido_en: 'x', ambiguo: [] }), null);
  const i = informeGratis(entrada());
  assert.deepEqual(comoInformeGratis(JSON.parse(JSON.stringify(i))), i);
});

// ─── El servidor ─────────────────────────────────────────────────────────────

/** Un cliente que falla si se le pide cualquier cosa. */
const intocable = new Proxy({}, { get: () => { throw new Error('no debería llamar a la base de datos'); } }) as never;

test('sin BAJAS_AUTOMATICAS=informe no corre nada', async () => {
  for (const entorno of [{}, { BAJAS_AUTOMATICAS: 'activa' }, { BAJAS_AUTOMATICAS: 'apagado' }]) {
    assert.deepEqual(await medirGratisEnSeco(intocable, { hoy: HOY, entorno, ahora: new Date(`${HOY}T10:00:00Z`) }),
      { skipped: 'BAJAS_AUTOMATICAS no está en informe' });
  }
});

test('el «hoy» es el de Madrid: a las 00:30 del día siguiente el informe del día anterior ya no se mide', async () => {
  const informe = { BAJAS_AUTOMATICAS: 'informe' };
  // 17-oct 00:30 en Madrid = 16-oct 22:30 UTC: el día del informe (16) ya no es hoy.
  assert.deepEqual(await medirGratisEnSeco(intocable, { hoy: HOY, entorno: informe, ahora: new Date(`${HOY}T22:30:00Z`) }),
    { skipped: 'el día del informe ya no es el de hoy en Madrid' });
});

test('el servidor solo escribe la columna del informe: ni `uso_plan_gratis` ni `studios`', () => {
  const codigo = readFileSync(join(import.meta.dirname, 'gratis-en-seco-servidor.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(codigo, /\.(insert|upsert|delete)\(/);
  assert.doesNotMatch(codigo, /\.rpc\(/);
  assert.doesNotMatch(codigo, /refrescarUsoGratis|reservarMedicion|cerrarPlanGratis|convertirAGratisSiToca/);
  const escrituras = [...codigo.matchAll(/\.from\('([a-z_]+)'\)\s*\.update\(/g)].map(m => m[1]);
  assert.deepEqual(escrituras, ['estudio_situacion_diaria']);
  assert.equal((codigo.match(/\.update\(/g) ?? []).length, 1);
  // Y el cron lo llama después del informe diario, sobre las filas de ese día.
  const cron = readFileSync(join(import.meta.dirname, '../../app/api/cron/notif-trial/route.ts'), 'utf8');
  assert.ok(cron.indexOf('await registrarSituacionDiaria(') < cron.indexOf('await medirGratisEnSeco('), 'la medición va después del informe');
});
