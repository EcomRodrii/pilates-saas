// Herramientas de agenda: un día entero y las próximas clases flojas o llenas.
// Las clases pasan por las MISMAS funciones que «Hoy en el estudio» de Inicio
// (`construirAgendaDelDia`), así que la señal y el motivo de cada clase son los
// que ya ve la propietaria.
//
// ⚠️ Sin `ausencia`: no se rellena a propósito (no se llama a la función del
// calendario que la completa). Con ella, el motivo de una clase sin instructora
// diría el TIPO de ausencia, que puede ser una baja médica. Así sale genérico
// («Sin instructora»). Y las sustituciones llegan sin su motivo
// (lib/calendario/rango-servidor.ts).

import { sesionesYReservasDelRango, type RangoDelEstudio } from '@/lib/calendario/rango-servidor';
import { enriquecerSesiones } from '@/lib/calendario-datos';
import { construirAgendaDelDia, resumirDia, type ClaseDelDia } from '@/lib/hoy-agenda';
import { finDelDiaEstudio, horaEstudio, hoyEnEstudio, inicioDelDiaEstudio } from '@/lib/utils';
import type { ClaseDelBloque, ContextoHerramienta, ResultadoHerramienta } from '../tipos.ts';
import { marca } from '../referencias.ts';
import { campo } from '../recorte.ts';
import { MAX_FILAS } from '../limites.ts';
import { diaDeLaAgenda, diaLargo, sumarDiasYmd, type EntradaAgenda, type EntradaHuecos } from './definiciones.ts';
import { exigir, fallo } from './comun.ts';

const DIAS_ALCANCE = 60;

export async function clasesDelRango(ctx: ContextoHerramienta, desdeDia: string, hastaDia: string): Promise<{ rango: RangoDelEstudio; clases: ClaseDelDia[] }> {
  const rango = exigir(await sesionesYReservasDelRango(ctx.admin, ctx.studioId, inicioDelDiaEstudio(desdeDia), finDelDiaEstudio(hastaDia)), 'agenda');
  const sesiones = enriquecerSesiones(rango.sesiones, rango.sustituciones);
  return { rango, clases: construirAgendaDelDia({ sesiones, reservas: rango.reservas, ahora: ctx.ahora }) };
}

/** Una clase para el modelo y para la tarjeta, con la instructora como referencia. */
export function describirClase(c: ClaseDelDia, rango: RangoDelEstudio, ctx: ContextoHerramienta, conDia: boolean) {
  const ref = c.instructorId ? ctx.refs.equipo(c.instructorId) : '';
  const dia = hoyEnEstudio(new Date(c.inicio));
  const hora = `${conDia ? `${diaLargo(dia)}, ` : ''}${horaEstudio(c.inicio)}`;
  const tipoClase = campo(rango.tiposClase.get(c.tipoClaseId)) || 'Clase';
  const sala = campo(rango.salas.get(c.salaId)) || '';
  const motivo = c.motivos[0]?.texto ?? null;
  const bloque: ClaseDelBloque = {
    sesionId: c.sesionId, hora, tipoClase, sala, instructora: ref, ocupadas: c.ocupadas, aforo: c.aforo,
    enEspera: c.enEspera, senal: c.senal, motivo,
  };
  const modelo = {
    hora, tipoClase, sala, instructora: ref ? marca(ref) : 'sin asignar',
    ocupadas: `${c.ocupadas} de ${c.aforo}`, huecos: c.huecos, enEspera: c.enEspera,
    cancelada: c.estado === 'CANCELADA', terminada: c.finalizada, senal: c.senal, motivo,
  };
  return { bloque, modelo };
}

export async function agendaDelDia(input: EntradaAgenda, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const dia = diaDeLaAgenda(input, ctx.hoy);
  if (!dia) return fallo('La fecha no es válida: usa el formato AAAA-MM-DD.');
  if (dia < sumarDiasYmd(ctx.hoy, -DIAS_ALCANCE) || dia > sumarDiasYmd(ctx.hoy, DIAS_ALCANCE)) {
    return fallo(`Solo puedo mirar la agenda hasta ${DIAS_ALCANCE} días antes o después de hoy. Para otras fechas, está en el Calendario.`);
  }
  const { rango, clases } = await clasesDelRango(ctx, dia, dia);
  const resumen = resumirDia(clases);
  const filas = clases.map(c => describirClase(c, rango, ctx, false));
  return {
    paraModelo: {
      dia: diaLargo(dia),
      resumen: {
        clases: resumen.clases, alumnasApuntadas: resumen.alumnas, huecosLibres: resumen.huecos,
        pendientesDeConfirmar: resumen.pendientes, clasesQuePidenAtencion: resumen.problemas, canceladas: resumen.canceladas,
      },
      clases: filas.map(f => f.modelo),
    },
    bloques: [{
      tipo: 'clases',
      titulo: `Clases del ${diaLargo(dia)}`,
      href: '/calendario',
      total: clases.length,
      clases: filas.slice(0, MAX_FILAS).map(f => f.bloque),
    }],
  };
}

export async function clasesProximasConHuecos(input: EntradaHuecos, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> {
  const { rango, clases } = await clasesDelRango(ctx, ctx.hoy, sumarDiasYmd(ctx.hoy, input.dias));
  const elegidas = clases.filter(c => {
    if (c.estado === 'CANCELADA' || c.finalizada || c.aforo <= 0) return false;
    return input.cuales === 'flojas' ? c.huecos * 2 >= c.aforo : c.huecos === 0 || c.enEspera > 0;
  });
  const filas = elegidas.map(c => describirClase(c, rango, ctx, true));
  const titulo = input.cuales === 'flojas' ? `Clases flojas en los próximos ${input.dias} días` : `Clases llenas en los próximos ${input.dias} días`;
  return {
    paraModelo: {
      criterio: input.cuales === 'flojas' ? 'Con la mitad del aforo o más libre' : 'Sin huecos o con lista de espera',
      clasesProgramadas: clases.filter(c => c.estado !== 'CANCELADA' && !c.finalizada).length,
      total: elegidas.length,
      clases: filas.map(f => f.modelo),
    },
    bloques: [{ tipo: 'clases', titulo, href: '/calendario', total: elegidas.length, clases: filas.slice(0, MAX_FILAS).map(f => f.bloque) }],
  };
}
