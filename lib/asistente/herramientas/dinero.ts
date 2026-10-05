// Herramientas de dinero: lo cobrado en un periodo y lo pendiente de cobro.
// SOLO con `puedeVerFinanzas` (a la gerente ni se le ofrecen, y aquí se vuelve
// a comprobar). Las cifras pasan por las MISMAS funciones que «Lo que he
// cobrado» e Informes › Dinero (`dineroDelTramo`) y que «Sin cobrar» de Cobros
// (`resumirRecibos`): docs/cifras-financieras.md. Nunca el concepto libre del
// recibo: a la IA solo le llegan importes, fechas, situación y referencias.

import { recibosCobradosEnTramo, recibosSinCobrar } from '@/lib/cobros/recibos-servidor';
import { dineroDelTramo, type ReciboDeInforme } from '@/lib/informes/dinero';
import { ORDEN_MOTIVOS, TEXTO_MOTIVO, tipoDePlanPorSuscripcion } from '@/lib/informes/motivo-cobro';
import { importeAdeudado, importeEnCurso, resumirRecibos, situacionRecibo } from '@/lib/billing/situacion-recibo';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { todasLasFilas, type Pagina } from '@/lib/clientas/estado-servidor';
import type { TipoPlan } from '@/lib/types';
import type { ContextoHerramienta, Metrica, ResultadoHerramienta } from '../tipos.ts';
import { marca } from '../referencias.ts';
import { MAX_FILAS } from '../limites.ts';
import { diaLargo, type EntradaFacturacion, type EntradaPendientes } from './definiciones.ts';
import { euros, exigir, fallo, tono, tramosDelPeriodo, variacion } from './comun.ts';

const NOTA_DINERO = 'Bruto, con IVA y antes de comisiones de Stripe; lo cobrado ya es neto de devoluciones y cuenta en el día en que se cobró.';
const IDS_POR_CONSULTA = 100;

/** El tipo de plan de cada suscripción de esos recibos, para el desglose por motivo. Acotado al estudio. */
async function tipoDePlanDe(ctx: ContextoHerramienta, recibos: readonly ReciboDeInforme[]) {
  const ids = [...new Set(recibos.map(r => r.suscripcionId).filter((x): x is string => !!x))];
  const suscripciones: { id: string; plan_id: string }[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) {
    const lote = ids.slice(i, i + IDS_POR_CONSULTA);
    const r = await todasLasFilas<{ id: string; plan_id: string }>((d, h) =>
      ctx.admin.from('suscripciones').select('id, plan_id').eq('studio_id', ctx.studioId).in('id', lote)
        .order('id').range(d, h) as unknown as Pagina<{ id: string; plan_id: string }>);
    if (r.error) exigir(null, 'suscripciones');
    suscripciones.push(...r.data);
  }
  const planes = await todasLasFilas<{ id: string; tipo: TipoPlan }>((d, h) =>
    ctx.admin.from('planes_tarifa').select('id, tipo').eq('studio_id', ctx.studioId)
      .order('id').range(d, h) as unknown as Pagina<{ id: string; tipo: TipoPlan }>);
  if (planes.error) exigir(null, 'planes');
  return tipoDePlanPorSuscripcion(suscripciones.map(s => ({ id: s.id, planId: s.plan_id })), planes.data);
}

export async function facturacionDelPeriodo(input: EntradaFacturacion, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  if (!puedeVerFinanzas(ctx.rol)) return fallo('Las cifras de dinero no están disponibles para tu rol.');
  const p = tramosDelPeriodo(input.periodo, input.cual, ctx.hoy);
  const desde = p.anterior?.desde ?? p.visible.desde;
  const recibos = exigir(await recibosCobradosEnTramo(ctx.admin, ctx.studioId, { desde, hasta: p.visible.hasta }), 'recibos');
  const tipoDe = await tipoDePlanDe(ctx, recibos);
  const actual = dineroDelTramo(recibos, p.visible, { periodo: p.periodo, tipoDePlanDe: tipoDe });
  const antes = p.anterior ? dineroDelTramo(recibos, p.anterior, { periodo: p.periodo, tipoDePlanDe: tipoDe }) : null;
  const dif = antes ? variacion(actual.neto, antes.neto) : null;
  const motivos = ORDEN_MOTIVOS.filter(m => actual.porMotivo[m].n > 0 || (antes?.porMotivo[m].n ?? 0) > 0);

  const metricas: Metrica[] = [
    { etiqueta: 'Cobrado', valor: euros(actual.neto), tipo: 'eur', href: '/cobros',
      ...(antes && p.frente && dif ? { comparacion: { texto: dif, tono: tono(actual.neto, antes.neto), frente: p.frente } } : {}) },
    { etiqueta: 'Cobros', valor: String(actual.nCobros), tipo: 'n' },
    { etiqueta: 'Clientas que pagaron', valor: String(actual.clientasQuePagaron), tipo: 'n' },
    ...(actual.ingresoMedioPorClienta !== null ? [{ etiqueta: 'Ingreso medio por clienta', valor: euros(actual.ingresoMedioPorClienta), tipo: 'eur' as const }] : []),
  ];
  return {
    paraModelo: {
      periodo: p.texto,
      nota: NOTA_DINERO,
      cobrado: euros(actual.neto),
      cobros: actual.nCobros,
      clientasQuePagaron: actual.clientasQuePagaron,
      ingresoMedioPorClienta: actual.ingresoMedioPorClienta === null ? null : euros(actual.ingresoMedioPorClienta),
      porMotivo: motivos.map(m => ({ motivo: TEXTO_MOTIVO[m], cobrado: euros(actual.porMotivo[m].neto), cobros: actual.porMotivo[m].n })),
      comparacion: antes && p.frente ? { frente: p.frente, cobrado: euros(antes.neto), cobros: antes.nCobros, variacion: dif } : null,
    },
    bloques: [{ tipo: 'metricas', titulo: `Lo cobrado · ${p.texto}`, nota: NOTA_DINERO, metricas }],
  };
}

const SITUACION = { POR_COBRAR: 'por cobrar', IMPAGADO: 'impagado', EN_CURSO: 'en el banco, sin confirmar' } as const;

export async function pagosPendientes(input: EntradaPendientes, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  if (!puedeVerFinanzas(ctx.rol)) return fallo('Las cifras de dinero no están disponibles para tu rol.');
  const recibos = exigir(await recibosSinCobrar(ctx.admin, ctx.studioId), 'recibos');
  const r = resumirRecibos(recibos);
  const ordenados = [...recibos].sort((a, b) => input.orden === 'mayor_importe'
    ? Number(b.importe) - Number(a.importe) || a.id.localeCompare(b.id)
    : (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? '') || a.id.localeCompare(b.id));
  const filas = ordenados.slice(0, MAX_FILAS).map(x => {
    const s = situacionRecibo(x) as keyof typeof SITUACION;
    return {
      id: x.id,
      ref: x.socioId ? ctx.refs.socia(x.socioId) : null,
      importe: euros(importeAdeudado(x) || importeEnCurso(x)),
      situacion: s,
      vence: x.fechaVencimiento ? diaLargo(x.fechaVencimiento.slice(0, 10)) : 'sin fecha',
    };
  });
  const pendiente = r.porCobrar + r.impagado;
  return {
    paraModelo: {
      nota: 'Pendiente = por cobrar + impagado. Lo que está en el banco sin confirmar va aparte y todavía no es deuda.',
      pendiente: euros(pendiente),
      porCobrar: euros(r.porCobrar),
      impagado: euros(r.impagado),
      enElBancoSinConfirmar: euros(r.enCurso),
      clientasConDeuda: r.nClientasConDeuda,
      recibosSinCobrar: recibos.length,
      recibos: filas.map(f => ({ alumna: f.ref ? marca(f.ref) : 'venta sin clienta', importe: f.importe, situacion: SITUACION[f.situacion], vence: f.vence })),
    },
    bloques: [{
      tipo: 'recibos', titulo: 'Sin cobrar', href: '/cobros', total: recibos.length, importeTotal: euros(pendiente),
      recibos: filas.map(f => ({ reciboId: f.id, alumna: f.ref, importe: f.importe, situacion: f.situacion, vence: f.vence })),
    }],
  };
}
