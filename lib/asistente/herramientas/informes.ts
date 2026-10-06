// Herramientas de Informes: ocupación por franja, actividad de un periodo y
// datos para elegir cuándo hacer un evento. Pasan por las MISMAS funciones que
// Informes › Clases y Clientas (`clasesDelTramo`, `clientasDelTramo`,
// `puntosDeDiferencia`), así que dan las cifras que ya ve la propietaria.

import { sesionesYReservasDelRango, type RangoDelEstudio } from '@/lib/calendario/rango-servidor';
import { clasesDelTramo, puntosDeDiferencia, type FranjaDelInforme, type ReservaParaInforme, type SesionParaInforme } from '@/lib/informes/clases';
import { clientasDelTramo } from '@/lib/informes/clientas';
import { finDelDiaEstudio, franjaLocalDe, inicioDelDiaEstudio } from '@/lib/utils';
import type { Tramo } from '@/lib/cobros/lo-cobrado';
import type { ContextoHerramienta, ResultadoHerramienta } from '../tipos.ts';
import { marca } from '../referencias.ts';
import { campo } from '../recorte.ts';
import { diaLargo, sumarDiasYmd, type EntradaActividad, type EntradaEvento, type EntradaFranja } from './definiciones.ts';
import { exigir, pct, tramosDelPeriodo } from './comun.ts';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

async function rangoDeDias(ctx: ContextoHerramienta, desde: string, hasta: string): Promise<RangoDelEstudio> {
  return exigir(await sesionesYReservasDelRango(ctx.admin, ctx.studioId, inicioDelDiaEstudio(desde), finDelDiaEstudio(hasta)), 'clases');
}

const paraInforme = (r: RangoDelEstudio) => ({
  sesiones: r.sesiones as unknown as SesionParaInforme[],
  reservas: r.reservas as unknown as ReservaParaInforme[],
});

interface FranjaConTipo extends FranjaDelInforme { tipoClaseId: string; enEspera: number }

function franjasDe(r: RangoDelEstudio, t: Tramo, ahora: Date): { total: ReturnType<typeof clasesDelTramo>; franjas: FranjaConTipo[] } {
  const { sesiones, reservas } = paraInforme(r);
  const total = clasesDelTramo(sesiones, reservas, t, ahora);
  const espera = new Map<string, number>();
  for (const x of r.reservas) if (x.estado === 'LISTA_ESPERA') espera.set(x.sesionId, (espera.get(x.sesionId) ?? 0) + 1);
  const franjas = total.tipos.flatMap(tipo => tipo.franjas.map(f => ({
    ...f, tipoClaseId: tipo.tipoClaseId, enEspera: f.sesiones.reduce((n, s) => n + (espera.get(s.sesionId) ?? 0), 0),
  })));
  return { total, franjas };
}

export async function ocupacionPorFranja(input: EntradaFranja, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const p = tramosDelPeriodo(input.periodo, input.cual, ctx.hoy);
  const r = await rangoDeDias(ctx, p.visible.desde, p.visible.hasta);
  const { total, franjas } = franjasDe(r, p.visible, ctx.ahora);
  const comparables = franjas.filter(f => f.nClases >= 2 && f.pct !== null)
    .sort((a, b) => (input.orden === 'peor' ? a.pct! - b.pct! : b.pct! - a.pct!) || a.clave.localeCompare(b.clave))
    .slice(0, 10);
  const tipo = (id: string) => campo(r.tiposClase.get(id)) || 'Clase';
  return {
    paraModelo: {
      periodo: p.texto,
      ocupacionGlobal: pct(total.pct),
      clasesDadas: total.nClases,
      nota: 'Ocupación = plazas reservadas (vinieran o no) sobre el aforo, solo clases ya empezadas. Solo franjas con 2 clases o más.',
      franjas: comparables.map(f => ({ franja: f.texto, tipoClase: tipo(f.tipoClaseId), ocupacion: pct(f.pct), clases: f.nClases, enListaDeEspera: f.enEspera })),
    },
    bloques: [{
      tipo: 'franjas',
      titulo: `${input.orden === 'peor' ? 'Franjas con menos ocupación' : 'Franjas con más ocupación'} · ${p.texto}`,
      href: '/informes',
      franjas: comparables.map(f => ({ clave: `${f.clave}-${f.tipoClaseId}`, texto: f.texto, tipoClase: tipo(f.tipoClaseId), ocupacion: f.pct, nClases: f.nClases, enEspera: f.enEspera })),
    }],
  };
}

export async function actividadDelPeriodo(input: EntradaActividad, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const p = tramosDelPeriodo(input.periodo, input.cual, ctx.hoy);
  const r = await rangoDeDias(ctx, p.anterior?.desde ?? p.visible.desde, p.visible.hasta);
  const { sesiones, reservas } = paraInforme(r);
  const actual = clasesDelTramo(sesiones, reservas, p.visible, ctx.ahora);
  const anterior = p.anterior ? clasesDelTramo(sesiones, reservas, p.anterior, ctx.ahora) : null;
  const clientas = clientasDelTramo(sesiones, reservas, p.visible, ctx.ahora);
  const clientasAntes = p.anterior ? clientasDelTramo(sesiones, reservas, p.anterior, ctx.ahora) : null;
  const puntos = puntosDeDiferencia(actual, anterior);
  const top = clientas.lasQueMasVienen.map(c => ({ ref: ctx.refs.socia(c.socioId), socioId: c.socioId, clases: c.clases }));
  const textoPuntos = puntos === null ? null : puntos === 0 ? 'igual' : `${puntos > 0 ? '+' : '−'}${Math.abs(puntos)} puntos`;
  return {
    paraModelo: {
      periodo: p.texto,
      clasesDadas: actual.nClases,
      ocupacion: pct(actual.pct),
      alumnasQueVinieron: clientas.vinieron,
      sinPasarLista: actual.sinPasarLista,
      comparacion: anterior && p.frente ? {
        frente: p.frente, clasesDadas: anterior.nClases, ocupacion: pct(anterior.pct),
        diferenciaOcupacion: textoPuntos, alumnasQueVinieron: clientasAntes?.vinieron ?? null,
      } : null,
      lasQueMasVienen: top.map(c => ({ alumna: marca(c.ref), clases: c.clases })),
    },
    bloques: [
      {
        tipo: 'metricas',
        titulo: `Actividad · ${p.texto}`,
        ...(actual.sinPasarLista ? { nota: 'No se ha pasado lista: no se sabe quién vino.' } : {}),
        metricas: [
          { etiqueta: 'Clases dadas', valor: String(actual.nClases), tipo: 'n', href: '/informes',
            ...(anterior && p.frente ? { comparacion: { texto: String(anterior.nClases), tono: actual.nClases > anterior.nClases ? 'sube' : actual.nClases < anterior.nClases ? 'baja' : 'igual', frente: p.frente } } : {}) },
          { etiqueta: 'Ocupación', valor: pct(actual.pct), tipo: 'pct', href: '/informes',
            ...(textoPuntos && p.frente ? { comparacion: { texto: textoPuntos, tono: puntos! > 0 ? 'sube' : puntos! < 0 ? 'baja' : 'igual', frente: p.frente } } : {}) },
          { etiqueta: 'Alumnas que vinieron', valor: String(clientas.vinieron), tipo: 'n', href: '/informes',
            ...(clientasAntes && p.frente ? { comparacion: { texto: String(clientasAntes.vinieron), tono: clientas.vinieron > clientasAntes.vinieron ? 'sube' : clientas.vinieron < clientasAntes.vinieron ? 'baja' : 'igual', frente: p.frente } } : {}) },
        ],
      },
      ...(top.length ? [{
        tipo: 'alumnas' as const, titulo: 'Las que más vienen', href: '/informes', total: top.length,
        alumnas: top.map(c => ({ ref: c.ref, socioId: c.socioId, detalle: `${c.clases} clases` })),
      }] : []),
    ],
  };
}

export async function datosParaUnEvento(input: EntradaEvento, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const historial: Tramo = { desde: sumarDiasYmd(ctx.hoy, -7 * input.semanas_historial), hasta: sumarDiasYmd(ctx.hoy, -1) };
  const vista = { desde: sumarDiasYmd(ctx.hoy, 1), hasta: sumarDiasYmd(ctx.hoy, 7 * input.semanas_vista) };
  const [pasado, futuro, horarioR] = await Promise.all([
    rangoDeDias(ctx, historial.desde, historial.hasta),
    rangoDeDias(ctx, vista.desde, vista.hasta),
    ctx.admin.from('studio_horario').select('dia_semana, abierto, hora_apertura, hora_cierre').eq('studio_id', ctx.studioId),
  ]);
  if (horarioR.error) exigir(null, 'horario');
  const { franjas } = franjasDe(pasado, historial, ctx.ahora);
  const tipo = (id: string) => campo(pasado.tiposClase.get(id)) || 'Clase';
  const conDatos = franjas.filter(f => f.nClases >= 2 && f.pct !== null);
  const demanda = conDatos.filter(f => f.pct! >= 85 || f.enEspera > 0)
    .sort((a, b) => b.enEspera - a.enEspera || b.pct! - a.pct!).slice(0, 6);
  const flojas = [...conDatos].sort((a, b) => a.pct! - b.pct!).filter(f => !demanda.includes(f)).slice(0, 4);

  const programadas = new Map<number, number>();
  for (const s of futuro.sesiones) {
    if (s.cancelada) continue;
    const { dow } = franjaLocalDe(s.inicio);
    programadas.set(dow, (programadas.get(dow) ?? 0) + 1);
  }
  const horario = new Map(((horarioR.data ?? []) as { dia_semana: number; abierto: boolean; hora_apertura: string | null; hora_cierre: string | null }[]).map(h => [h.dia_semana, h]));
  const dias = ORDEN_SEMANA.map(dow => {
    const h = horario.get(dow);
    return {
      dia: DIAS[dow],
      abierto: h ? h.abierto : null,
      horario: h?.abierto && h.hora_apertura && h.hora_cierre ? `${h.hora_apertura.slice(0, 5)}–${h.hora_cierre.slice(0, 5)}` : null,
      clasesProgramadas: programadas.get(dow) ?? 0,
    };
  });
  const abiertos = dias.filter(d => d.abierto !== false).sort((a, b) => a.clasesProgramadas - b.clasesProgramadas);
  const fila = (f: FranjaConTipo) => ({ franja: f.texto, tipoClase: tipo(f.tipoClaseId), ocupacion: pct(f.pct), clases: f.nClases, enListaDeEspera: f.enEspera });
  return {
    paraModelo: {
      demandaMirada: `del ${diaLargo(historial.desde)} al ${diaLargo(historial.hasta)}`,
      programadoMirado: `del ${diaLargo(vista.desde)} al ${diaLargo(vista.hasta)}`,
      franjasConMasDemanda: demanda.map(fila),
      franjasMasFlojas: flojas.map(fila),
      diasConMenosClasesProgramadas: abiertos.slice(0, 4),
      horarioConocido: horario.size > 0,
    },
    bloques: [{
      tipo: 'franjas',
      titulo: 'Franjas con más demanda',
      href: '/informes',
      franjas: demanda.map(f => ({ clave: `${f.clave}-${f.tipoClaseId}`, texto: f.texto, tipoClase: tipo(f.tipoClaseId), ocupacion: f.pct, nClases: f.nClases, enEspera: f.enEspera })),
    }],
  };
}
