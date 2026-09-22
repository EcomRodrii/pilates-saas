import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasDeLaOferta, proyectarClasesFijas, terminaPronto, type SociaMin } from './clases-fijas.ts';
import { TEXTOS_CLASES_FIJAS } from './clases-fijas-textos.ts';
import type { CatalogoClasesFijas, OfertaAlumna } from '../clases-fijas-reglas.ts';

const franja = (diaSemana: number, hora: string, tipoClaseId = 'tc-1') =>
  ({ diaSemana, hora, tipoClaseId, salaId: 'sala-1', tipo: 'Reformer', sala: 'Sala 1', instructora: 'Marta' });

const oferta = (cambios: Partial<OfertaAlumna> = {}): OfertaAlumna => ({
  id: 'cf-1', nombre: 'Reformer · martes y jueves', descripcion: null, estado: 'DISPONIBLE', plazasLibres: 3,
  duraciones: [{ meses: 1, etiqueta: '1 mes', hasta: '2026-10-21' }, { meses: 3, etiqueta: '3 meses', hasta: '2026-12-21' }],
  franjas: [franja(2, '10:00'), franja(4, '10:00')], programadaHasta: '2027-01-30', ...cambios,
});

const cat = (o: OfertaAlumna[] = [oferta()], pedidas: CatalogoClasesFijas['pedidas'] = []): CatalogoClasesFijas => ({ ofertas: o, pedidas });
const planMensual = { id: 'plan-1', tipo: 'MENSUAL', tiposClaseIds: [] as string[] };
const cuota = { planId: 'plan-1', estado: 'ACTIVA', fechaFin: null };
const socia = (cambios: Partial<SociaMin> = {}): SociaMin => ({ suscripciones: [cuota], plazasFijas: [], ...cambios });
const HOY = '2026-09-21';

test('sin catálogo o con otra forma no hay nada que enseñar, y no revienta', () => {
  assert.deepEqual(proyectarClasesFijas(null, socia(), [planMensual], HOY), []);
  assert.deepEqual(proyectarClasesFijas({} as CatalogoClasesFijas, socia(), [planMensual], HOY), []);
});

test('con cuota que cubre todas sus clases, y sin nada pedido: la puede pedir', () => {
  const [v] = proyectarClasesFijas(cat(), socia(), [planMensual], HOY);
  assert.equal(v.estadoAlumna, 'LIBRE');
  assert.equal(v.tieneCuota, true);
  assert.equal(v.pedida, null);
});

test('con bono (o sin cuota que cubra) no se le ofrece el botón: se le dice por qué', () => {
  const [conBono] = proyectarClasesFijas(cat(), socia({ suscripciones: [{ planId: 'plan-bono', estado: 'ACTIVA', fechaFin: null }] }),
    [{ id: 'plan-bono', tipo: 'BONO', tiposClaseIds: [] }], HOY);
  assert.equal(conBono.tieneCuota, false);
  const [sinNada] = proyectarClasesFijas(cat(), socia({ suscripciones: [] }), [planMensual], HOY);
  assert.equal(sinNada.tieneCuota, false);
});

test('la cuota tiene que cubrir TODAS las clases de la oferta, no solo una', () => {
  const mixta = oferta({ franjas: [franja(2, '10:00', 'tc-1'), franja(4, '18:00', 'tc-2')] });
  const soloTc1 = { id: 'plan-1', tipo: 'MENSUAL', tiposClaseIds: ['tc-1'] };
  assert.equal(proyectarClasesFijas(cat([mixta]), socia(), [soloTc1], HOY)[0].tieneCuota, false);
  const ambos = { id: 'plan-1', tipo: 'MENSUAL', tiposClaseIds: ['tc-1', 'tc-2'] };
  assert.equal(proyectarClasesFijas(cat([mixta]), socia(), [ambos], HOY)[0].tieneCuota, true);
});

test('una cuota caducada no cuenta', () => {
  const s = socia({ suscripciones: [{ planId: 'plan-1', estado: 'ACTIVA', fechaFin: '2026-09-20' }] });
  assert.equal(proyectarClasesFijas(cat(), s, [planMensual], HOY)[0].tieneCuota, false);
});

test('sin sesión no se le riñe por la cuota (no se sabe)', () => {
  assert.equal(proyectarClasesFijas(cat(), null, [planMensual], HOY)[0].tieneCuota, true);
});

test('petición pendiente: sale como pedida, con lo que eligió', () => {
  const [v] = proyectarClasesFijas(cat([oferta()], [{ claseFijaId: 'cf-1', solicitudId: 'spf-9', duracionMeses: 3, hasta: '2026-12-21', tipo: 'CREAR_CLASE_FIJA' as const }]), socia(), [planMensual], HOY);
  assert.equal(v.estadoAlumna, 'PEDIDA');
  assert.deepEqual(v.pedida, { solicitudId: 'spf-9', duracionMeses: 3, hasta: '2026-12-21' });
});

test('la petición de OTRA oferta no aparece en esta', () => {
  const [v] = proyectarClasesFijas(cat([oferta()], [{ claseFijaId: 'cf-otra', solicitudId: 'spf-9', duracionMeses: 3, hasta: '2026-12-21', tipo: 'CREAR_CLASE_FIJA' as const }]), socia(), [planMensual], HOY);
  assert.equal(v.pedida, null);
  assert.equal(v.estadoAlumna, 'LIBRE');
});

const plazaDe = (dia: number) => ({ diaSemana: dia, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: null, estado: 'ACTIVA', vigenciaHasta: null });

test('si ya tiene todas sus clases, la tiene; si solo una parte, es parcial', () => {
  assert.equal(proyectarClasesFijas(cat(), socia({ plazasFijas: [plazaDe(2), plazaDe(4)] }), [planMensual], HOY)[0].estadoAlumna, 'LA_TIENE');
  assert.equal(proyectarClasesFijas(cat(), socia({ plazasFijas: [plazaDe(2)] }), [planMensual], HOY)[0].estadoAlumna, 'PARCIAL');
});

test('una plaza vencida o de baja no cuenta como que ya la tiene', () => {
  const vencida = { ...plazaDe(2), vigenciaHasta: '2026-09-01' };
  const baja = { ...plazaDe(4), estado: 'BAJA' };
  assert.equal(proyectarClasesFijas(cat(), socia({ plazasFijas: [vencida, baja] }), [planMensual], HOY)[0].estadoAlumna, 'LIBRE');
});

test('los días de la oferta, en lenguaje de persona y con el lunes primero', () => {
  assert.equal(diasDeLaOferta([{ diaSemana: 4 }, { diaSemana: 2 }]), 'martes y jueves');
  assert.equal(diasDeLaOferta([{ diaSemana: 0 }, { diaSemana: 1 }, { diaSemana: 3 }]), 'lunes, miércoles y domingos');
  assert.equal(diasDeLaOferta([{ diaSemana: 2 }, { diaSemana: 2 }]), 'martes');
  assert.equal(diasDeLaOferta([]), '');
});

test('los textos no prometen una reserva que aún no existe', () => {
  assert.match(TEXTOS_CLASES_FIJAS.comoFunciona, /tu estudio la revisa/);
  assert.doesNotMatch(TEXTOS_CLASES_FIJAS.botonPedir, /reservar/i, 'el botón dice «pedir», no «reservar»');
  assert.equal(TEXTOS_CLASES_FIJAS.plazasLibres(1), 'Queda 1 plaza');
  assert.equal(TEXTOS_CLASES_FIJAS.plazasLibres(4), 'Quedan 4 plazas');
});

const plazaDe2 = (dia: number, hasta: string | null = null) => ({ diaSemana: dia, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: null, estado: 'ACTIVA', vigenciaHasta: hasta });

test('vence el: la fecha en que termina, solo si la tiene entera y con fecha', () => {
  const [conFecha] = proyectarClasesFijas(cat(), socia({ plazasFijas: [plazaDe2(2, '2026-12-21'), plazaDe2(4, '2026-11-12')] }), [planMensual], HOY);
  assert.equal(conFecha.venceEl, '2026-11-12', 'la más próxima de las dos franjas');
  const [parcial] = proyectarClasesFijas(cat(), socia({ plazasFijas: [plazaDe2(2, '2026-12-21')] }), [planMensual], HOY);
  assert.equal(parcial.venceEl, null, 'solo tiene una franja de dos: no hay «hasta» que dar');
  const [sinFecha] = proyectarClasesFijas(cat(), socia({ plazasFijas: [plazaDe2(2, null), plazaDe2(4, null)] }), [planMensual], HOY);
  assert.equal(sinFecha.venceEl, null, 'sin vencimiento (dada a mano): nada que avisar ni ampliar');
});

test('ampliación pedida: sale aparte de «pedida» (crear), y no se confunden', () => {
  const pedidas: CatalogoClasesFijas['pedidas'] = [{ claseFijaId: 'cf-1', solicitudId: 'spf-amp', duracionMeses: 3, hasta: '2027-01-12', tipo: 'AMPLIAR_CLASE_FIJA' }];
  const [v] = proyectarClasesFijas(cat([oferta()], pedidas), socia({ plazasFijas: [plazaDe2(2, '2026-12-21'), plazaDe2(4, '2026-11-12')] }), [planMensual], HOY);
  assert.equal(v.estadoAlumna, 'LA_TIENE', 'una ampliación pendiente no la vuelve a poner como «pedida»');
  assert.equal(v.pedida, null);
  assert.deepEqual(v.ampliacionPedida, { solicitudId: 'spf-amp', duracionMeses: 3, hasta: '2027-01-12' });
});

test('termina pronto: dentro de la ventana de aviso, no antes ni después de vencer', () => {
  assert.equal(terminaPronto('2026-10-05', '2026-09-21'), true, '14 días exactos');
  assert.equal(terminaPronto('2026-10-06', '2026-09-21'), false, '15 días: todavía no');
  assert.equal(terminaPronto('2026-09-21', '2026-09-21'), true, 'vence hoy mismo');
  assert.equal(terminaPronto('2026-09-20', '2026-09-21'), false, 'ya venció: no se ofrece ampliar, se ofrece pedirla de nuevo');
  assert.equal(terminaPronto(null, '2026-09-21'), false);
});
