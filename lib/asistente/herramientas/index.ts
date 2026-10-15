// El registro de herramientas: cada definición (./definiciones.ts) con su
// `ejecutar`, en el MISMO orden fijo (orden = caché). Y la puerta por la que
// pasa todo `tool_use` que escribe el modelo: herramienta conocida, permitida a
// este rol (otra vez: no se fía de que solo se le ofrecieran las suyas),
// entrada validada con zod, tope de tiempo y resultado recortado.

import type { BloqueAsistente, ContextoHerramienta, Herramienta, NombreHerramienta, ResultadoHerramienta } from '../tipos.ts';
import { recortarResultado } from '../recorte.ts';
import { TIMEOUT_HERRAMIENTA_MS } from '../limites.ts';
import { DEFINICIONES } from './definiciones.ts';
import { alumnasSinVenir, bonosPorCaducar, contarAlumnas } from './clientas.ts';
import { agendaDelDia, clasesProximasConHuecos } from './agenda.ts';
import { actividadDelPeriodo, datosParaUnEvento, ocupacionPorFranja, ocupacionPorTipoDeClase } from './informes.ts';
import { eventosProximos } from './comunidad.ts';
import { facturacionDelPeriodo, pagosPendientes } from './dinero.ts';
import { queRevisarHoy, resumenDelEstudio } from './estudio.ts';
import { mensajeDeFaltantes } from './faltantes.ts';
import { LecturaFallida, fallo } from './comun.ts';
import { proponerCita, proponerClase, proponerClases, proponerEvento, proponerSala } from '../acciones/servidor.ts';
import { guardarPropuesta } from '../acciones/servidor.ts';
import type { Preparada } from '../acciones/nucleo.ts';

type Ejecutor = (input: never, ctx: ContextoHerramienta) => Promise<ResultadoHerramienta>;

/** Una herramienta de ACCIÓN: prepara y guarda la propuesta; no escribe nada del estudio. */
const proponiendo = <I>(preparar: (i: I, ctx: ContextoHerramienta) => Promise<Preparada>): Ejecutor =>
  (async (input: I, ctx: ContextoHerramienta): Promise<ResultadoHerramienta> => {
    const p = await preparar(input, ctx);
    if (!p.ok) return fallo(p.error);
    const bloque = await guardarPropuesta(ctx, p);
    return {
      paraModelo: {
        propuesta: 'preparada, a la espera de que la propietaria pulse Confirmar',
        resumen: p.resumen,
        ...(p.avisos.length ? { avisos: p.avisos } : {}),
        ...(p.efecto ? { efecto: p.efecto } : {}),
        nota: 'La tarjeta con Confirmar ya está en el panel. Di en una frase qué propones y que confirme; NO digas que está creada.',
      },
      bloques: [bloque],
    };
  }) as unknown as Ejecutor;

const EJECUTORES: Record<NombreHerramienta, Ejecutor> = {
  resumen_del_estudio: resumenDelEstudio,
  que_revisar_hoy: queRevisarHoy,
  contar_alumnas: contarAlumnas,
  alumnas_sin_venir: alumnasSinVenir,
  agenda_del_dia: agendaDelDia,
  clases_proximas_con_huecos: clasesProximasConHuecos,
  ocupacion_por_franja: ocupacionPorFranja,
  actividad_del_periodo: actividadDelPeriodo,
  facturacion_del_periodo: facturacionDelPeriodo,
  pagos_pendientes: pagosPendientes,
  bonos_por_caducar: bonosPorCaducar,
  datos_para_un_evento: datosParaUnEvento,
  proponer_clase: proponiendo(proponerClase),
  proponer_sala: proponiendo(proponerSala),
  proponer_evento: proponiendo(proponerEvento),
  proponer_cita: proponiendo(proponerCita),
  proponer_clases: proponiendo(proponerClases),
  ocupacion_por_tipo_de_clase: ocupacionPorTipoDeClase,
  eventos_proximos: eventosProximos,
};

export const REGISTRO: readonly Herramienta<unknown>[] = DEFINICIONES.map(d => ({
  ...d,
  ejecutar: EJECUTORES[d.nombre] as unknown as Herramienta<unknown>['ejecutar'],
}));

export interface SalidaDeHerramienta {
  /** El `content` del `tool_result`: JSON recortado. */
  contenido: string;
  esError: boolean;
  bloques: BloqueAsistente[];
  /** Para el log y la Sentry: nunca texto de datos. */
  codigo: 'OK' | 'DESCONOCIDA' | 'NO_PERMITIDA' | 'ENTRADA_INVALIDA' | 'SIN_RESPUESTA' | 'LECTURA_FALLIDA' | 'TIEMPO' | 'ERROR';
}

const salidaDeError = (codigo: SalidaDeHerramienta['codigo'], mensaje: string): SalidaDeHerramienta =>
  ({ contenido: JSON.stringify({ error: mensaje }), esError: true, bloques: [], codigo });

function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, rechazar) => { t = setTimeout(() => rechazar(new Error('TIEMPO')), ms); }),
  ]).finally(() => clearTimeout(t));
}

export async function ejecutarHerramienta(
  nombre: string, input: unknown, ctx: ContextoHerramienta, registro: readonly Herramienta<unknown>[] = REGISTRO,
): Promise<SalidaDeHerramienta> {
  const h = registro.find(x => x.nombre === nombre);
  if (!h) return salidaDeError('DESCONOCIDA', 'Esa consulta no existe.');
  if (!h.permitida(ctx.rol)) return salidaDeError('NO_PERMITIDA', 'Esa consulta no está disponible para tu rol.');
  const entrada = h.zod.safeParse(input);
  if (!entrada.success) {
    if (h.clase === 'accion') {
      return salidaDeError('ENTRADA_INVALIDA', mensajeDeFaltantes(entrada.error.issues));
    }
    return salidaDeError('ENTRADA_INVALIDA', 'Los parámetros de la consulta no son válidos.');
  }
  try {
    const r = await conTope(h.ejecutar(entrada.data, ctx), TIMEOUT_HERRAMIENTA_MS);
    return { contenido: recortarResultado(r.paraModelo), esError: r.esError === true, bloques: r.bloques, codigo: r.esError ? 'SIN_RESPUESTA' : 'OK' };
  } catch (e) {
    if (e instanceof LecturaFallida) return salidaDeError('LECTURA_FALLIDA', 'No he podido leer ese dato ahora. No digas que no hay: di que ahora no se ha podido mirar.');
    if (e instanceof Error && e.message === 'TIEMPO') return salidaDeError('TIEMPO', 'Esa consulta ha tardado demasiado. Di que ahora no se ha podido mirar.');
    return salidaDeError('ERROR', 'No he podido leer ese dato ahora. Di que ahora no se ha podido mirar.');
  }
}
