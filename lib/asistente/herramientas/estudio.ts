// Herramientas generales: el resumen del estudio y la bandeja de «qué revisar
// hoy». La bandeja es la MISMA que la home (`contarConteosEstudio` +
// `construirEstadoEstudio`), con su gate por rol: lo que este rol no puede ver
// ni se cuenta. El veredicto del día solo para quien ve el Centro de Control.

import { contarConteosEstudio } from '@/lib/estado-estudio-servidor';
import { construirEstadoEstudio } from '@/lib/estado-estudio';
import { dbGetMensajeDia, dbGetRecomendacion } from '@/lib/decision/db';
import { cargarClientasServidor } from '@/lib/clientas/estado-servidor';
import { contarPorEstado, contarSinVenir } from '@/lib/clientas/estado';
import { recibosCobradosEnTramo, recibosSinCobrar } from '@/lib/cobros/recibos-servidor';
import { cobradoEnTramo } from '@/lib/cobros/lo-cobrado';
import { resumirRecibos } from '@/lib/billing/situacion-recibo';
import { resumirDia } from '@/lib/hoy-agenda';
import { puedeVer, puedeVerFinanzas } from '@/lib/permisos-reglas';
import type { ContextoHerramienta, Metrica, ResultadoHerramienta } from '../tipos.ts';
import { marcarPersonasEnPregunta } from '../referencias.ts';
import { diaLargo } from './definiciones.ts';
import { clasesDelRango } from './agenda.ts';
import { euros, exigir, tono, tramosDelPeriodo, variacion } from './comun.ts';

/** El texto de una recomendación lo pudo redactar un modelo, y nombra a quien
 *  sea: no solo a `reco.socioId` (A4 dice «la primera, <nombre>…» de una socia que
 *  no es la de la recomendación). Se seudonimiza con TODAS las personas del estudio,
 *  la misma lista con que se marca la pregunta; lo que no se pueda reconocer
 *  como persona del estudio no sale como nombre propio. */
function sinNombres(texto: string, ctx: ContextoHerramienta): string {
  return marcarPersonasEnPregunta(texto, ctx.personas, ctx.refs).texto.slice(0, 300);
}

export async function queRevisarHoy(_input: unknown, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const conteos = await contarConteosEstudio(ctx.admin, { studioId: ctx.studioId, rol: ctx.rol, userId: ctx.userId, ahora: ctx.ahora });
  const estado = construirEstadoEstudio(conteos);
  const lineas = [
    ...estado.decidir.map(l => ({ ...l, bandeja: 'decidir' as const })),
    ...estado.enMarcha.map(l => ({ ...l, bandeja: 'enMarcha' as const })),
  ];

  let veredicto: { titulo: string; motivo: string } | null = null;
  if (puedeVer(ctx.rol, '/centro-de-control') && ctx.plan.decisiones) {
    const mensaje = await dbGetMensajeDia(ctx.studioId, ctx.hoy);
    if (mensaje?.tipo === 'MENSAJE' && mensaje.recomendacionId) {
      const reco = await dbGetRecomendacion(mensaje.recomendacionId, ctx.studioId);
      if (reco) {
        veredicto = {
          titulo: sinNombres(reco.titulo, ctx),
          motivo: sinNombres(reco.motivo, ctx),
        };
      }
    }
  }

  return {
    paraModelo: {
      esperaTuDecision: estado.decidir.map(l => ({ que: l.texto, cuantas: l.n })),
      totalPorDecidir: estado.nDecidir,
      tentareLoTieneEnMarcha: estado.enMarcha.map(l => ({ que: l.texto, cuantas: l.n })),
      resueltoHoy: estado.resuelto.map(l => ({ que: l.texto, cuantas: l.n })),
      mensajeDelDia: veredicto,
      nota: 'Las líneas que dependen de un permiso que este rol no tiene no se cuentan.',
    },
    bloques: [{
      tipo: 'revisar',
      lineas: lineas.map(l => ({ id: l.id, n: l.n, texto: l.texto, href: l.href, bandeja: l.bandeja })),
      veredicto: veredicto ? { titulo: veredicto.titulo, href: '/centro-de-control' } : null,
    }],
  };
}

export async function resumenDelEstudio(_input: unknown, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const verDinero = puedeVerFinanzas(ctx.rol);
  const mes = tramosDelPeriodo('mes', 'actual', ctx.hoy);
  const [clientas, hoy, conteos, cobrados, sinCobrar] = await Promise.all([
    cargarClientasServidor(ctx.admin, ctx.studioId, { ahora: ctx.ahora }),
    clasesDelRango(ctx, ctx.hoy, ctx.hoy),
    contarConteosEstudio(ctx.admin, { studioId: ctx.studioId, rol: ctx.rol, userId: ctx.userId, ahora: ctx.ahora }),
    verDinero ? recibosCobradosEnTramo(ctx.admin, ctx.studioId, { desde: mes.anterior?.desde ?? mes.visible.desde, hasta: mes.visible.hasta }) : Promise.resolve(null),
    verDinero ? recibosSinCobrar(ctx.admin, ctx.studioId) : Promise.resolve(null),
  ]);
  const c = exigir(clientas, 'clientas');
  const porEstado = contarPorEstado(c.estados);
  const sinVenir = contarSinVenir(c.fichas, c.estados, c.hechos, ctx.ahora);
  const dia = resumirDia(hoy.clases);
  const nDecidir = construirEstadoEstudio(conteos).nDecidir;

  let dinero: { cobradoEsteMes: string; frente: string | null; variacion: string | null; pendienteDeCobro: string } | null = null;
  const metricasDinero: Metrica[] = [];
  if (verDinero) {
    const recibos = exigir(cobrados, 'recibos');
    const actual = cobradoEnTramo(recibos, mes.visible).neto;
    const antes = mes.anterior ? cobradoEnTramo(recibos, mes.anterior).neto : null;
    const r = resumirRecibos(exigir(sinCobrar, 'recibos'));
    const v = variacion(actual, antes);
    dinero = { cobradoEsteMes: euros(actual), frente: mes.frente, variacion: v, pendienteDeCobro: euros(r.porCobrar + r.impagado) };
    metricasDinero.push(
      { etiqueta: 'Cobrado este mes', valor: euros(actual), tipo: 'eur', href: '/cobros',
        ...(antes !== null && v && mes.frente ? { comparacion: { texto: v, tono: tono(actual, antes), frente: mes.frente } } : {}) },
      { etiqueta: 'Pendiente de cobro', valor: euros(r.porCobrar + r.impagado), tipo: 'eur', href: '/cobros' },
    );
  }

  return {
    paraModelo: {
      hoy: diaLargo(ctx.hoy),
      alumnas: { activas: porEstado.ACTIVA, dePrueba: porEstado.DE_PRUEBA, sinRenovar: porEstado.SIN_RENOVAR, sinVenirMasDe30Dias: sinVenir },
      clasesDeHoy: { clases: dia.clases, alumnasApuntadas: dia.alumnas, huecosLibres: dia.huecos, quePidenAtencion: dia.problemas },
      cosasQueEsperanTuDecision: nDecidir,
      dinero: dinero ?? 'no disponible para este rol',
      notaDinero: dinero ? 'Bruto, con IVA y antes de comisiones; lo cobrado es neto de devoluciones.' : undefined,
    },
    bloques: [{
      tipo: 'metricas',
      titulo: 'Tu estudio hoy',
      metricas: [
        { etiqueta: 'Alumnas activas', valor: String(porEstado.ACTIVA), tipo: 'n', href: '/clientas?estado=ACTIVA' },
        { etiqueta: 'De prueba', valor: String(porEstado.DE_PRUEBA), tipo: 'n', href: '/clientas?estado=DE_PRUEBA' },
        { etiqueta: 'Sin venir 30d', valor: String(sinVenir), tipo: 'n', href: '/clientas?mas=sin_venir_30d' },
        { etiqueta: 'Clases hoy', valor: String(dia.clases), tipo: 'n', href: '/calendario' },
        { etiqueta: 'Por decidir', valor: String(nDecidir), tipo: 'n', href: '/dashboard' },
        ...metricasDinero,
      ],
    }],
  };
}
