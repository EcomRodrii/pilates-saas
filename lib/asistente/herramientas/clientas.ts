// Herramientas sobre alumnas: cuántas hay en cada estado, quién lleva tiempo
// sin venir y qué bonos caducan. Las cifras salen de las MISMAS funciones que
// Clientas y el Resumen (`contarPorEstado`, `sinVenir`), así que dan el mismo
// número por construcción. Personas como referencia, nunca nombre.

import { cargarClientasServidor } from '@/lib/clientas/estado-servidor';
import {
  contarPorEstado, DEFINICION_ESTADO, DIAS_SIN_VENIR, ESTADOS_CLIENTA, ETIQUETA_ESTADO, sinVenir,
} from '@/lib/clientas/estado';
import { leerBonosPorCaducar } from '@/lib/notificaciones/bonos-inactivas-cron';
import type { ContextoHerramienta, ResultadoHerramienta } from '../tipos.ts';
import { marca } from '../referencias.ts';
import { campo } from '../recorte.ts';
import { MAX_FILAS } from '../limites.ts';
import { diaLargo, sumarDiasYmd, type EntradaBonos, type EntradaSinVenir } from './definiciones.ts';
import { diasDesde, exigir } from './comun.ts';


export async function contarAlumnas(_input: unknown, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const leido = exigir(await cargarClientasServidor(ctx.admin, ctx.studioId, { ahora: ctx.ahora }), 'clientas');
  const c = contarPorEstado(leido.estados);
  const conAlguna = ESTADOS_CLIENTA.filter(e => c[e] > 0);
  return {
    paraModelo: {
      total: c.TOTAL,
      porEstado: conAlguna.map(e => ({ estado: ETIQUETA_ESTADO[e], alumnas: c[e], significa: DEFINICION_ESTADO[e] })),
      conPlanOBonoParaReservar: c.CON_DERECHO,
    },
    bloques: [{
      tipo: 'metricas',
      titulo: 'Tus alumnas',
      metricas: ESTADOS_CLIENTA.filter(e => c[e] > 0 || e === 'ACTIVA').map(e => ({
        // El mismo filtro de Clientas al que llevan las cifras del Resumen.
        etiqueta: ETIQUETA_ESTADO[e], valor: String(c[e]), tipo: 'n' as const, href: `/clientas?estado=${e}`,
      })),
    }],
  };
}

export async function alumnasSinVenir(input: EntradaSinVenir, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const leido = exigir(await cargarClientasServidor(ctx.admin, ctx.studioId, { ahora: ctx.ahora }), 'clientas');
  const filas = leido.fichas
    .filter(f => sinVenir(leido.estados.get(f.id), leido.hechos.get(f.id), f.fechaAlta, ctx.ahora))
    .map(f => {
      const desde = leido.hechos.get(f.id)?.ultimaAsistencia ?? f.fechaAlta ?? null;
      return { id: f.id, dias: desde ? diasDesde(desde, ctx.ahora) : null, vino: !!leido.hechos.get(f.id)?.ultimaAsistencia, estado: leido.estados.get(f.id)?.estado ?? 'INACTIVA' };
    })
    .sort((a, b) => {
      const da = a.dias ?? Number.MAX_SAFE_INTEGER, db = b.dias ?? Number.MAX_SAFE_INTEGER;
      return (input.orden === 'mas_recientes' ? da - db : db - da) || a.id.localeCompare(b.id);
    });
  const primeras = filas.slice(0, MAX_FILAS).map(f => ({ ...f, ref: ctx.refs.socia(f.id) }));
  const detalle = (f: (typeof primeras)[number]) =>
    f.dias === null ? 'Sin fecha' : `${f.dias} días ${f.vino ? 'sin venir' : 'desde el alta, sin venir nunca'}`;
  return {
    paraModelo: {
      criterio: `Más de ${DIAS_SIN_VENIR} días desde su última clase, o desde su alta si nunca ha venido`,
      total: filas.length,
      alumnas: primeras.map(f => ({ alumna: marca(f.ref), dias: f.dias, haVenidoAlgunaVez: f.vino, estado: ETIQUETA_ESTADO[f.estado] })),
    },
    bloques: [{
      tipo: 'alumnas',
      titulo: `Sin venir en ${DIAS_SIN_VENIR} días`,
      href: '/clientas?mas=sin_venir_30d',
      total: filas.length,
      alumnas: primeras.map(f => ({ ref: f.ref, socioId: f.id, detalle: detalle(f) })),
    }],
  };
}

export async function bonosPorCaducar(input: EntradaBonos, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const hasta = sumarDiasYmd(ctx.hoy, input.dias);
  const [bonos, planesR] = await Promise.all([
    leerBonosPorCaducar(ctx.admin, ctx.studioId, { desde: ctx.hoy, hasta }),
    ctx.admin.from('planes_tarifa').select('id, nombre').eq('studio_id', ctx.studioId).limit(1000),
  ]);
  if (planesR.error) exigir(null, 'planes');
  const plan = new Map(((planesR.data ?? []) as { id: string; nombre: string }[]).map(p => [p.id, campo(p.nombre)]));
  const conSocia = bonos.filter(b => b.socio_id)
    .sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin) || a.id.localeCompare(b.id));
  const primeros = conSocia.slice(0, MAX_FILAS).map(b => ({
    id: b.id, ref: ctx.refs.socia(b.socio_id!), plan: (b.plan_id && plan.get(b.plan_id)) || 'Bono',
    restantes: b.sesiones_restantes, caduca: diaLargo(b.fecha_fin.slice(0, 10)),
  }));
  return {
    paraModelo: {
      entre: `hoy y el ${diaLargo(hasta)}`,
      total: conSocia.length,
      sesionesSinGastar: conSocia.reduce((n, b) => n + b.sesiones_restantes, 0),
      bonos: primeros.map(b => ({ alumna: marca(b.ref), plan: b.plan, sesionesQueLeQuedan: b.restantes, caduca: b.caduca })),
    },
    bloques: [{
      tipo: 'bonos',
      titulo: `Bonos que caducan en ${input.dias} días`,
      href: '/clientas',
      total: conSocia.length,
      bonos: primeros.map(b => ({ suscripcionId: b.id, alumna: b.ref, plan: b.plan, restantes: b.restantes, caduca: b.caduca })),
    }],
  };
}
