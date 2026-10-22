import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planificarAlineacion, finDeEntregaAlineacion, idReciboAlineacion, vistaPreviaAlineacion, huellaVistaPrevia,
  normalizarModoAlineacion, validarCambioModo, alineacionProporcionalActiva, decidirRenovacion, nombreCorto, PREFIJO_RECIBO_ALINEACION,
} from './alineacion-dia1.ts';
import { esReciboParcialDeCuota, MARCA_CONCEPTO_PARCIAL } from './prorrateo.ts';
import { proximoFinAlineadoDia1 } from '../bono-logic.ts';
import { readFileSync } from 'node:fs';

const plan = (precio = 50) => ({ tipo: 'MENSUAL' as const, precio, periodicidadMeses: 1 as const });
const plan1 = (fechaFin: string, hoy: string, precio = 50, dm = 3, extra: object = {}) =>
  planificarAlineacion({ suscripcionId: 's1', fechaFin, plan: plan(precio), hoyISO: hoy, diasMinimos: dm, ...extra });

test('renueva el 5 (fecha_fin 4): 27 de 31 días de octubre, acaba el 31', () => {
  const p = plan1('2026-10-04', '2026-10-05')!;
  assert.equal(p.tipo, 'cobrar');
  assert.equal(p.diasRestantes, 27);
  assert.equal(p.diasDelMes, 31);
  assert.equal(p.importe, 43.55); // 50*27/31 = 43,548…
  assert.equal(p.fechaFinNueva, '2026-10-31');
  assert.equal(p.primerCobroCompleto, '2026-11-01');
  assert.equal(p.reciboId, 'rec-aline-s1-2026-10-04');
  assert.match(p.concepto, /Parte proporcional de octubre: 27 de 31 días/);
  assert.ok(p.concepto.length <= 90, p.concepto);
  assert.ok(p.concepto.toLowerCase().includes(MARCA_CONCEPTO_PARCIAL));
});

test('renueva el 16: 16 de 31 días', () => {
  const p = plan1('2026-10-15', '2026-10-16')!;
  assert.equal(p.diasRestantes, 16);
  assert.equal(p.importe, 25.81);
});

test('renueva el 29 con 3 días: cortesía, sin recibo, extiende al 31', () => {
  const p = plan1('2026-10-28', '2026-10-29')!;
  assert.equal(p.tipo, 'extender');
  assert.equal(p.importe, 0);
  assert.equal(p.fechaFinNueva, '2026-10-31');
  assert.equal(p.diasRestantes, 3);
});

test('renueva el 28: 4 días > 3, se cobra', () => {
  const p = plan1('2026-10-27', '2026-10-28')!;
  assert.equal(p.tipo, 'cobrar');
  assert.equal(p.diasRestantes, 4);
});

test('días mínimos 0: renueva el 31 se cobra 1 día (50/31 = 1,61)', () => {
  const p = plan1('2026-10-30', '2026-10-31', 50, 0)!;
  assert.equal(p.tipo, 'cobrar');
  assert.equal(p.importe, 1.61);
});

test('suelo 0,50 €: cuota de 5 € con 3 días no se cobra aunque dias mínimos sea 0', () => {
  const p = plan1('2026-10-28', '2026-10-29', 5, 0)!; // 5*3/31 = 0,48
  assert.equal(p.tipo, 'extender');
});

test('ya alineada (acaba el último día del mes): null, igual que hoy', () => {
  assert.equal(plan1('2026-10-31', '2026-11-01'), null);
  assert.equal(plan1('2027-02-28', '2027-03-01'), null);
  assert.equal(plan1('2028-02-29', '2028-03-01'), null);
});

test('renovación en día 1 (fecha_fin = último día): ya alineada; D día 1 nunca prorratea', () => {
  assert.equal(plan1('2026-11-30', '2026-12-01'), null);
});

test('febrero y bisiesto', () => {
  const a = plan1('2027-02-09', '2027-02-10')!; // 19 de 28
  assert.equal(a.diasRestantes, 19);
  assert.equal(a.diasDelMes, 28);
  assert.equal(a.fechaFinNueva, '2027-02-28');
  const b = plan1('2028-02-09', '2028-02-10')!; // 20 de 29
  assert.equal(b.diasRestantes, 20);
  assert.equal(b.diasDelMes, 29);
  assert.equal(b.fechaFinNueva, '2028-02-29');
  // renueva el 1 de marzo desde fin 28 feb: alineada
  assert.equal(plan1('2027-02-28', '2027-03-01'), null);
});

test('cambio de hora: aritmética de calendario, no de horas', () => {
  const p = plan1('2026-10-24', '2026-10-25')!; // domingo del cambio de hora en España
  assert.equal(p.diasRestantes, 7);
  const q = plan1('2026-03-28', '2026-03-29')!;
  assert.equal(q.diasRestantes, 3);
  assert.equal(q.tipo, 'extender');
});

test('fin de año: diciembre', () => {
  const p = plan1('2026-12-09', '2026-12-10')!;
  assert.equal(p.diasRestantes, 22);
  assert.equal(p.fechaFinNueva, '2026-12-31');
  assert.equal(p.primerCobroCompleto, '2027-01-01');
});

test('no elegibles: sin fecha, Stripe, no mensual, trimestral, precio 0', () => {
  assert.equal(plan1('2026-10-04', '2026-10-05', 50, 3, { stripeSubscriptionId: 'sub_x' }), null);
  assert.equal(planificarAlineacion({ suscripcionId: 's', fechaFin: null, plan: plan(), hoyISO: '2026-10-05' }), null);
  assert.equal(planificarAlineacion({ suscripcionId: 's', fechaFin: '2026-10-04', plan: { tipo: 'BONO', precio: 50 }, hoyISO: '2026-10-05' }), null);
  assert.equal(planificarAlineacion({ suscripcionId: 's', fechaFin: '2026-10-04', plan: { tipo: 'MENSUAL', precio: 150, periodicidadMeses: 3 }, hoyISO: '2026-10-05' }), null);
  assert.equal(planificarAlineacion({ suscripcionId: 's', fechaFin: '2026-10-04', plan: plan(0), hoyISO: '2026-10-05' }), null);
});

test('si el mes de la renovación ya pasó, camino de siempre (null)', () => {
  assert.equal(plan1('2026-09-10', '2026-10-05'), null);
  // el cron llega con retraso pero dentro del mes: el importe NO cambia con el retraso
  const tarde = plan1('2026-10-04', '2026-10-20')!;
  const aTiempo = plan1('2026-10-04', '2026-10-05')!;
  assert.equal(tarde.importe, aTiempo.importe);
  assert.equal(tarde.reciboId, aTiempo.reciboId);
});

test('importes con céntimos: 49,99 y redondeo al céntimo', () => {
  const p = plan1('2026-10-14', '2026-10-15', 49.99)!; // 17/31
  assert.equal(p.importe, 27.41); // 49,99*17/31 = 27,4138…
});

test('coherencia con A: B acaba el mes y la entera del día 1 lleva al mismo sitio que A', () => {
  const p = plan1('2026-10-04', '2026-10-05')!;
  // Tras B la cuota acaba el 31-oct (alineada); el día 1 la renovación lleva al 30-nov.
  assert.equal(proximoFinAlineadoDia1(p.fechaFinNueva, { periodicidadMeses: 1 }), '2026-11-30');
  // A (hoy) deja la cuota hasta el mismo 30-nov de una sola vez.
  assert.equal(proximoFinAlineadoDia1('2026-10-04', { periodicidadMeses: 1 }), '2026-11-30');
});

test('modo A intacto: proximoFinAlineadoDia1 no cambia (regresión)', () => {
  assert.equal(proximoFinAlineadoDia1('2026-10-14', { periodicidadMeses: 1 }), '2026-11-30');
  assert.equal(proximoFinAlineadoDia1('2026-11-30', { periodicidadMeses: 1 }), '2026-12-31');
});

test('entrega anclada al recibo', () => {
  assert.equal(finDeEntregaAlineacion('2026-10-04', '2026-10-05'), '2026-10-31');
  assert.equal(finDeEntregaAlineacion('2026-10-04', '2026-10-31'), '2026-10-31');
  // cobrado cuando el mes ya pasó: solo los días pagados desde hoy, nunca el mes siguiente
  assert.equal(finDeEntregaAlineacion('2026-10-04', '2026-11-02'), '2026-11-02');
  // 15,10 € de 78 € (6 de 31 días de octubre... 6/31·78≈15,10) → 6 días desde el 1-nov
  assert.equal(finDeEntregaAlineacion('2026-10-25', '2026-11-01', { importeCentimos: 1510, cuotaCentimos: 7800 }), '2026-11-06');
  assert.equal(finDeEntregaAlineacion('2026-10-25', '2026-11-05', { importeCentimos: 1510, cuotaCentimos: 7800 }), '2026-11-10');
  assert.equal(finDeEntregaAlineacion(null, '2026-10-05'), null);
});

test('id con motivo, determinista, y reconocido como parcial', () => {
  assert.equal(idReciboAlineacion('sus-1', '2026-10-04'), 'rec-aline-sus-1-2026-10-04');
  assert.ok(esReciboParcialDeCuota(idReciboAlineacion('sus-1', '2026-10-04')));
  assert.ok(!esReciboParcialDeCuota('rec-renov-sus-1-2026-10'));
  assert.equal(PREFIJO_RECIBO_ALINEACION, 'rec-aline-');
});

test('modo: solo PROPORCIONAL exacto activa B, y solo con el día 1 encendido', () => {
  assert.equal(normalizarModoAlineacion('PROPORCIONAL'), 'PROPORCIONAL');
  for (const v of [undefined, null, '', 'proporcional', 'X', 1]) assert.equal(normalizarModoAlineacion(v), 'ENTERA');
  assert.equal(alineacionProporcionalActiva({ cobroDia1Activo: true, cobroDia1Modo: 'PROPORCIONAL' }), true);
  assert.equal(alineacionProporcionalActiva({ cobroDia1Activo: false, cobroDia1Modo: 'PROPORCIONAL' }), false);
  assert.equal(alineacionProporcionalActiva({ cobroDia1Activo: true }), false);
});

test('vista previa: totales, orden, cortesía y datos mínimos', () => {
  const v = vistaPreviaAlineacion([
    { suscripcionId: 'a', nombre: 'María', apellidos: 'García López', fechaFin: '2026-10-15', plan: plan(50) },
    { suscripcionId: 'b', nombre: 'Ana', apellidos: 'Ruiz', fechaFin: '2026-10-28', plan: plan(50) },
    { suscripcionId: 'c', nombre: 'Eva', apellidos: 'Sanz', fechaFin: '2026-10-31', plan: plan(50) }, // alineada
    { suscripcionId: 'd', nombre: 'Lu', apellidos: 'Gil', fechaFin: '2026-10-10', plan: plan(50), stripeSubscriptionId: 'sub_1' },
    { suscripcionId: 'e', nombre: 'Pía', apellidos: '', fechaFin: '2026-10-04', plan: plan(31) },
  ], '2026-10-05', 3);
  assert.equal(v.alumnas, 3);
  assert.deepEqual(v.filas.map(f => f.suscripcionId), ['e', 'a', 'b']);
  assert.equal(v.filas[1].alumna, 'María G.');
  assert.equal(v.filas[0].alumna, 'Pía');
  assert.equal(v.filas.find(f => f.suscripcionId === 'b')!.cortesia, true);
  assert.equal(v.alumnasEnCortesia, 1);
  assert.equal(v.totalCobraB, 27 + 25.81); // Pía 31*27/31 = 27, María 16/31*50
  assert.ok(v.totalRegalaA > v.totalCobraB);
  assert.ok(v.totalCortesiaB > 0);
  assert.match(v.ejemplo, /Opción A/);
  assert.match(v.ejemplo, /Opción B/);
  for (const f of v.filas) assert.deepEqual(Object.keys(f).sort(), ['alumna', 'cortesia', 'cuota', 'diasDelMes', 'diasRestantes', 'fechaRenovacion', 'pagaAhora', 'regalaA', 'suscripcionId']);
  assert.equal(v.huella, huellaVistaPrevia(v));
});

test('vista previa: la huella cambia si cambia la lista o el día', () => {
  const c = [{ suscripcionId: 'a', nombre: 'M', apellidos: 'G', fechaFin: '2026-10-15', plan: plan(50) }];
  const h1 = vistaPreviaAlineacion(c, '2026-10-05').huella;
  assert.notEqual(h1, vistaPreviaAlineacion(c, '2026-10-06').huella);
  assert.notEqual(h1, vistaPreviaAlineacion([...c, { ...c[0], suscripcionId: 'b' }], '2026-10-05').huella);
  assert.equal(h1, vistaPreviaAlineacion(c, '2026-10-05').huella);
});

test('vista previa sin alumnas: ejemplo de cortesía y sin romper', () => {
  const v = vistaPreviaAlineacion([], '2026-10-05');
  assert.equal(v.alumnas, 0);
  assert.equal(v.totalCobraB, 0);
  assert.ok(v.ejemplo.length > 0);
});

test('nombreCorto', () => {
  assert.equal(nombreCorto('María', 'garcía'), 'María G.');
  assert.equal(nombreCorto('Ana', ''), 'Ana');
});

const dec = (fechaFin: string, hoy: string, extra: object = {}) =>
  decidirRenovacion({ suscripcionId: 's1', fechaFin, plan: plan(50), hoyISO: hoy, diasMinimos: 3, modoProporcional: true, ...extra });

test('cron: con el modo B apagado SIEMPRE el camino de siempre (modo A intacto)', () => {
  for (const [f, h] of [['2026-10-04', '2026-10-05'], ['2026-10-28', '2026-10-29'], ['2026-10-31', '2026-11-01']]) {
    assert.deepEqual(dec(f, h, { modoProporcional: false }), { accion: 'normal' });
  }
  // aunque exista un rec-aline viejo: apagado = no se mira
  assert.deepEqual(dec('2026-10-04', '2026-10-05', { modoProporcional: false, reciboExistente: { estado: 'FALLIDO', entregaAplicada: null } }), { accion: 'normal' });
});

test('cron: B activo decide cobrar, extender o normal según la cuota', () => {
  assert.equal(dec('2026-10-04', '2026-10-05').accion, 'cobrar');
  assert.equal(dec('2026-10-28', '2026-10-29').accion, 'extender');
  assert.equal(dec('2026-10-31', '2026-11-01').accion, 'normal'); // ya alineada
  assert.equal(dec('2026-10-04', '2026-10-05', { stripeSubscriptionId: 'sub_1' }).accion, 'normal');
});

test('cron: idempotencia — con el recibo ya creado (cualquier estado) no se crea otro', () => {
  for (const estado of ['PENDIENTE', 'EN_CURSO', 'FALLIDO', 'DEVUELTO', 'COBRADO']) {
    const d = dec('2026-10-04', '2026-10-05', { reciboExistente: { estado, entregaAplicada: true } });
    assert.equal(d.accion, 'saltar', estado);
  }
});

test('cron: un rec-aline ANULADO ya no bloquea: camino de siempre', () => {
  assert.equal(dec('2026-10-04', '2026-10-05', { reciboExistente: { estado: 'ANULADO', entregaAplicada: null } }).accion, 'normal');
});

test('cron: cobrado sin entrega registrada se repara, no se cobra ni se crea otro', () => {
  const d = dec('2026-10-04', '2026-10-05', { reciboExistente: { estado: 'COBRADO', entregaAplicada: false } });
  assert.deepEqual(d, { accion: 'reparar', reciboId: 'rec-aline-s1-2026-10-04' });
});

test('cron: el mes cambia con un parcial FALLIDO pendiente: no se crea un segundo recibo', () => {
  // mismo fecha_fin ⇒ mismo id ⇒ mismo recibo; el cron en noviembre cae en `normal` solo si NO hay recibo previo
  assert.equal(dec('2026-10-04', '2026-11-03', { reciboExistente: { estado: 'FALLIDO', entregaAplicada: null } }).accion, 'saltar');
});

test('contrato del cron: la extensión sin recibo es condicional y el modo se lee fallo-seguro', () => {
  const src = readFileSync(new URL('../inngest/renovaciones.ts', import.meta.url), 'utf8');
  assert.match(src, /ejecutarDecisionAlineacion\(/);
  assert.match(src, /decidirRenovacion\(/);
  assert.match(src, /proporcional: false, diasMinimos: 3/);
  assert.match(src, /PREFIJO_RECIBO_ALINEACION\}%/); // el aviso de subida de precio ignora los parciales
});

test('contrato de la migración: columna con CHECK, default A, sin grant al navegador, trigger de reinicio', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const sql = readFileSync(new URL('20261022081316_cobro_dia_1_modo_alineacion.sql', dir), 'utf8');
  assert.match(sql, /cobro_dia_1_modo text not null default 'ENTERA'/);
  assert.match(sql, /check \(cobro_dia_1_modo in \('ENTERA', 'PROPORCIONAL'\)\)/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /grant update \(/);
  assert.match(sql, /before update of cobro_dia_1_activo/);
  assert.match(sql, /revoke all on function public\.studios_reset_modo_dia_1\(\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.studios_reset_modo_dia_1\(\) to service_role/);
});

test('ruta: validarCambioModo — roles, modo, día 1 y huella', () => {
  const base = { rol: 'PROPIETARIO', modo: 'PROPORCIONAL', dia1Activo: true, huella: 'h', huellaActual: 'h' };
  assert.deepEqual(validarCambioModo(base), { ok: true });
  for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR']) assert.equal(validarCambioModo({ ...base, rol }).ok, false);
  assert.equal((validarCambioModo({ ...base, rol: 'MANAGER' }) as { status: number }).status, 403);
  assert.equal((validarCambioModo({ ...base, modo: 'X' }) as { status: number }).status, 400);
  const r = (x: object) => validarCambioModo({ ...base, ...x }) as { ok: false; status: number; codigo: string };
  assert.equal(r({ dia1Activo: false }).codigo, 'DIA_1_APAGADO');
  assert.equal(r({ huella: undefined }).codigo, 'LISTA_CAMBIADA');
  assert.equal(r({ huella: '' }).codigo, 'LISTA_CAMBIADA');
  assert.equal(r({ huella: 'otra' }).status, 409);
  assert.equal(r({ huellaActual: null }).codigo, 'LISTA_CAMBIADA');
  // volver a A: sin huella y sin día 1
  assert.deepEqual(validarCambioModo({ ...base, modo: 'ENTERA', huella: undefined, dia1Activo: false }), { ok: true });
});

test('ruta: contrato — la escritura de B exige el día 1 encendido, el estudio sale de la sesión y se audita tras escribir', () => {
  const src = readFileSync(new URL('../../app/api/cobros/alineacion-dia1/route.ts', import.meta.url), 'utf8');
  assert.match(src, /q\.eq\('cobro_dia_1_activo', true\)/);
  assert.match(src, /validarCambioModo\(/);
  assert.doesNotMatch(src, /cuerpo\??\.(studioId|studio_id)/);
  assert.ok(src.indexOf('errEsc') < src.indexOf('registrarAuditoriaServidor(admin'));
});

test('huella: dos listas con los mismos totales pero distintas filas no coinciden', () => {
  const mk = (id: string) => vistaPreviaAlineacion([{ suscripcionId: id, nombre: 'A', apellidos: 'B', fechaFin: '2026-10-15', plan: plan(50) }], '2026-10-05');
  assert.notEqual(mk('x').huella, mk('y').huella);
});

const masDiasTest = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
test('barrido de invariantes: cada día de meses clave, días mínimos 0/3/10 y precios con céntimos', () => {
  for (const [mes, dias] of [['2026-02', 28], ['2027-02', 28], ['2028-02', 29], ['2026-03', 31], ['2026-10', 31], ['2026-11', 30], ['2026-12', 31]] as const) {
    for (let d = 1; d < dias; d++) {
      for (const dm of [0, 3, 10]) {
        for (const precio of [0.99, 5, 33.33, 50, 59.9, 999.99]) {
          const fin = `${mes}-${String(d).padStart(2, '0')}`;
          const p = planificarAlineacion({ suscripcionId: 's', fechaFin: fin, plan: plan(precio), hoyISO: masDiasTest(fin, 1), diasMinimos: dm });
          if (!p) continue;
          assert.equal(p.diasRestantes, dias - d, `${fin} dm${dm}`);
          assert.equal(p.fechaFinNueva, `${mes}-${dias}`);
          assert.ok(p.primerCobroCompleto.endsWith('-01'));
          if (p.tipo === 'cobrar') {
            assert.ok(p.importe >= 0.5 && p.importe <= precio, `${fin} ${precio} → ${p.importe}`);
            assert.ok(p.diasRestantes > dm);
          } else {
            assert.equal(p.importe, 0);
            assert.equal(p.concepto, '');
          }
        }
      }
    }
  }
});
