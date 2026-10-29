// Escenario «ausencia_recuperacion»: una alumna con cuota de límite semanal
// avisa de que no va a una clase. ¿Gana una recuperación? ¿Qué cambia si el
// estudio activa «la semana es la ventana»?
//
// ⚠️ Mismas funciones que el barrido real de los lunes
// (lib/recuperaciones/otorgar-semanales.ts): `canceladasCompensables`,
// `derechoDeRecuperaciones`, `semanaCerrada`. Lo que sí es copia a propósito es
// el filtro de «cancelada a tiempo y por la alumna» (está inline en el barrido).
import { z } from 'zod';
import { esCancelacionTardia } from '../../booking-logic.ts';
import {
  ESTADOS_QUE_USAN_LA_SEMANA, canceladasCompensables, derechoDeRecuperaciones,
} from '../../recuperaciones/derecho-semanal.ts';
import { semanaCerrada } from '../../recuperaciones/otorgar-semanales-fechas.ts';
import type { Comprobacion, DemoGenerada, PasoDemo } from '../modelo.ts';
import { CONTEXTO_POR_DEFECTO, type ContextoDemo } from '../centros.ts';
import { DIAS, ETIQUETA_DIA, LUNES_DEMO, diaMadrid, etiquetaFecha, haceCuanto, inicioClaseISO, sumarDias } from '../fechas.ts';

export const parametros = z.strictObject({
  limiteSemanal: z.number().int().min(1).max(5).default(2),
  clasesReservadas: z.number().int().min(1).max(5).default(2),
  clasesCanceladas: z.number().int().min(1).max(5).default(1),
  avisoHorasAntes: z.number().int().min(1).max(72).default(24),
  ventanaCancelacionHoras: z.number().int().min(0).max(48).default(12),
  vuelveAReservarLaMisma: z.boolean().default(false),
  repartoAutomatico: z.boolean().default(true),
  soloEnLaSemana: z.boolean().default(false),
}).superRefine((p, ctx) => {
  if (p.clasesReservadas > p.limiteSemanal) {
    ctx.addIssue({ code: 'custom', path: ['clasesReservadas'], message: 'No puede reservar más clases que su límite semanal.' });
  }
  if (p.clasesCanceladas > p.clasesReservadas) {
    ctx.addIssue({ code: 'custom', path: ['clasesCanceladas'], message: 'No puede cancelar más clases de las que reservó.' });
  }
});
export type Parametros = z.infer<typeof parametros>;

// Las clases de la semana ficticia: martes, miércoles, jueves, viernes, sábado.
const DIAS_CLASE = ['martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

export function generar(p: Parametros, ctx: ContextoDemo = CONTEXTO_POR_DEFECTO): DemoGenerada {
  const clases = DIAS_CLASE.slice(0, p.clasesReservadas);
  const tardiaPorClase = clases.map((d) => {
    const inicio = inicioClaseISO(d);
    const ahora = new Date(new Date(inicio).getTime() - p.avisoHorasAntes * 3_600_000);
    return esCancelacionTardia(inicio, ahora, p.ventanaCancelacionHoras);
  });

  // Las reservas de la semana, con la forma que lee el barrido.
  type R = { id: string; sesion_id: string; estado: string; cancelada_tardia: boolean | null; cancelada_motivo: string | null; creado_en: string };
  const reservas: R[] = clases.map((d, i) => ({
    id: `res-${i}`, sesion_id: `ses-${d}`,
    estado: i < p.clasesCanceladas ? 'CANCELADA' : 'CONFIRMADA',
    cancelada_tardia: i < p.clasesCanceladas ? tardiaPorClase[i] : null,
    cancelada_motivo: null,
    creado_en: `2026-10-30T10:0${i}:00Z`,
  }));
  if (p.vuelveAReservarLaMisma) {
    reservas.push({ id: 'res-vuelta', sesion_id: `ses-${clases[0]}`, estado: 'CONFIRMADA', cancelada_tardia: null, cancelada_motivo: null, creado_en: '2026-10-31T09:00:00Z' });
  }
  const usadas = reservas.filter((r) => (ESTADOS_QUE_USAN_LA_SEMANA as readonly string[]).includes(r.estado)).length;
  const canceladasATiempo = reservas.filter((r) => r.estado === 'CANCELADA' && r.cancelada_tardia === false && r.cancelada_motivo == null);
  const compensables = canceladasCompensables(canceladasATiempo, reservas);
  const derecho = derechoDeRecuperaciones(p.limiteSemanal, usadas, compensables.length);
  const concede = p.repartoAutomatico && !p.soloEnLaSemana;
  const recuperaciones = concede ? derecho : 0;
  const lunesSiguiente = sumarDias(LUNES_DEMO, 7);
  const semana = semanaCerrada(new Date(`${lunesSiguiente}T08:00:00Z`));
  const huecoLibre = Math.max(0, p.limiteSemanal - usadas);
  const algunaATiempo = tardiaPorClase.slice(0, p.clasesCanceladas).some((t) => !t);

  // Las pantallas REALES del panel que enseña cada paso (lib/demo/panel): Configuración con SUS reglas y el calendario.
  const reglasPanel = { ventanaCancelacionHoras: p.ventanaCancelacionHoras, recuperacionAutoSemanal: p.repartoAutomatico, recuperacionSoloEnLaSemana: p.soloEnLaSemana };
  const config = (titular: string, detalle: string) => ({ ruta: '/configuracion?tab=reservas', reglas: reglasPanel, foco: ['Dar recuperaciones solas al cerrar la semana', 'Recuperaciones'], pistas: ['Aquí se decide si las recuperaciones se dan solas al cerrar la semana.', 'Pulsa «Recuperaciones»: ahí se decide si se dan solas y cuánto duran.'], titular, detalle });
  // La semana de la alumna se ve en SU ficha (sus próximas clases), no en el calendario de todo el estudio.
  const calendario = (titular: string, detalle: string) => ({ ruta: '/clientas/soc-1', foco: ['Próximas clases'], titular, detalle });

  const regla = {
    hueco: {
      texto: 'Cancelar a tiempo libera el hueco de esa semana: las clases canceladas no cuentan para el límite semanal.',
      fuente: 'reservar_plaza · calcular_excede_limite_semanal',
    },
    derecho: {
      texto: 'Solo se compensa el hueco que se queda SIN USAR habiendo cancelado a tiempo, y nunca más recuperaciones que cancelaciones.',
      fuente: 'derechoDeRecuperaciones',
    },
    vuelve: {
      texto: 'Si vuelve a apuntarse a la misma clase, no ha perdido nada y no se le da recuperación.',
      fuente: 'canceladasCompensables',
    },
    barrido: {
      texto: 'Cada lunes se revisa la semana cerrada (lunes a domingo) y solo en estudios con el reparto automático encendido.',
      fuente: 'otorgarRecuperacionesSemanales · semanaCerrada',
    },
    ventana: {
      texto: 'Con «la semana es la ventana» no se concede ninguna recuperación al cancelar: el hueco solo sirve dentro de esa semana.',
      fuente: 'ajuste «La semana es la ventana»',
    },
    tardia: {
      texto: p.ventanaCancelacionHoras > 0
        ? `Cancelar con menos de ${p.ventanaCancelacionHoras} h es tardío y no compensa.`
        : 'Sin plazo de cancelación, toda cancelación cuenta como a tiempo.',
      fuente: 'esCancelacionTardia · barrido solo cuenta cancelada_tardia = false',
    },
  };

  const pasos: PasoDemo[] = [
    {
      pantalla: config('Las reglas del estudio', 'Plazo para cancelar, reparto automático de recuperaciones y «la semana es la ventana».'),
      id: 'configuracion', titulo: 'Las reglas del estudio',
      proposito: 'Tres ajustes deciden si esa alumna recibe algo por avisar de su ausencia.',
      bloques: [{ tipo: 'tabla', filas: [
        { k: 'Cuota de la alumna', v: `${p.limiteSemanal} ${p.limiteSemanal === 1 ? 'clase' : 'clases'} a la semana` },
        { k: 'Plazo para cancelar sin perder la sesión', v: p.ventanaCancelacionHoras > 0 ? `${p.ventanaCancelacionHoras} h antes` : 'Sin plazo' },
        { k: 'Dar recuperaciones solas al cerrar la semana', v: p.repartoAutomatico ? 'Sí' : 'No' },
        { k: 'La semana es la ventana', v: p.soloEnLaSemana ? 'Sí' : 'No' },
      ] }],
      porQue: [regla.tardia, regla.barrido, regla.ventana],
      configura: [
        { donde: 'Configuración → Reservas → Cancelar y recuperar', ajuste: 'Plazo para cancelar sin perder la sesión (horas antes)', valor: p.ventanaCancelacionHoras > 0 ? `${p.ventanaCancelacionHoras} h` : '0' },
        { donde: 'Configuración → Reservas → Recuperaciones', ajuste: 'Dar recuperaciones solas al cerrar la semana', valor: p.repartoAutomatico ? 'Activado' : 'Desactivado' },
        { donde: 'Configuración → Reservas → Recuperaciones', ajuste: 'La semana es la ventana: sin recuperaciones al cancelar', valor: p.soloEnLaSemana ? 'Activado' : 'Desactivado' },
        { donde: 'Productos → plan mensual', ajuste: 'Límite semanal', valor: String(p.limiteSemanal) },
      ],
    },
    {
      pantalla: calendario('Su semana', `Reserva ${p.clasesReservadas} ${p.clasesReservadas === 1 ? 'clase' : 'clases'}; su cuota permite ${p.limiteSemanal} a la semana.`),
      id: 'semana', titulo: 'Su semana',
      proposito: 'Reserva sus clases de la semana. Todavía no ha avisado de nada.',
      bloques: [{ tipo: 'semana', dias: DIAS.map((d) => ({
        dia: ETIQUETA_DIA[d],
        eventos: (clases as readonly string[]).includes(d) ? [{ texto: `${ctx.clase} · reservada`, tono: 'neutro' as const }] : [],
      })) }],
      porQue: [regla.hueco],
    },
    {
      pantalla: calendario(algunaATiempo ? 'Cancelación a tiempo' : 'Cancelación tardía', algunaATiempo ? 'El hueco de la semana queda libre para otra clase.' : 'Es tardía: no se compensa con ninguna recuperación.'),
      id: 'aviso', titulo: 'Avisa de que no puede ir',
      proposito: 'Cancela desde su app. Que sea a tiempo o tarde decide todo lo demás.',
      bloques: [
        { tipo: 'semana', dias: DIAS.map((d) => {
          const i = (clases as readonly string[]).indexOf(d);
          const cancelada = i >= 0 && i < p.clasesCanceladas;
          return { dia: ETIQUETA_DIA[d], eventos: i < 0 ? [] : [cancelada
            ? { texto: `Cancela (${haceCuanto(p.avisoHorasAntes)})`, tono: tardiaPorClase[i] ? ('aviso' as const) : ('ok' as const) }
            : { texto: 'Sigue reservada', tono: 'neutro' as const }] };
        }) },
        { tipo: 'resultado',
          titular: algunaATiempo ? 'Cancelación a tiempo' : 'Cancelación tardía',
          detalle: algunaATiempo
            ? 'El hueco de la semana queda libre para otra clase.'
            : 'Es tardía: no se compensa con ninguna recuperación.',
          tono: algunaATiempo ? 'ok' : 'aviso' },
      ],
      porQue: [regla.tardia, regla.hueco],
    },
    {
      pantalla: calendario('El hueco de la semana', `Le quedan ${huecoLibre} ${huecoLibre === 1 ? 'hueco' : 'huecos'} sin usar de su límite de ${p.limiteSemanal}.`),
      id: 'hueco', titulo: 'El hueco de la semana',
      proposito: 'Qué le queda por usar antes de que termine la semana.',
      bloques: [{ tipo: 'tabla', filas: [
        { k: 'Límite semanal', v: String(p.limiteSemanal) },
        { k: 'Clases que cuentan (reservadas y no canceladas)', v: String(usadas) },
        { k: 'Hueco sin usar', v: String(huecoLibre), tono: huecoLibre ? 'ok' : 'neutro' },
        ...(p.vuelveAReservarLaMisma ? [{ k: 'Vuelve a apuntarse a la misma clase', v: 'Sí: no pierde nada', tono: 'ok' as const }] : []),
      ] }],
      porQue: [regla.hueco, regla.vuelve],
    },
    {
      pantalla: config(recuperaciones > 0 ? `Gana ${recuperaciones} ${recuperaciones === 1 ? 'recuperación' : 'recuperaciones'}` : 'No gana ninguna recuperación', 'Cada lunes se cierra la semana: solo se compensa el hueco que se quedó sin usar habiendo cancelado a tiempo.'),
      id: 'cierre', titulo: `Lunes ${etiquetaFecha(lunesSiguiente).split(' ').slice(1).join(' ')}: se cierra la semana`,
      proposito: 'Es el único momento en que Tentare decide si le da una recuperación.',
      bloques: [
        { tipo: 'tabla', filas: [
          { k: 'Semana que se revisa', v: `${etiquetaFecha(semana.desde)} – ${etiquetaFecha(semana.hasta)}` },
          { k: 'Cancelaciones a tiempo que compensan', v: String(compensables.length) },
          { k: 'Derecho según el hueco', v: String(derecho) },
          { k: 'Recuperaciones concedidas', v: String(recuperaciones), tono: recuperaciones ? 'ok' : 'neutro' },
        ] },
        { tipo: 'resultado',
          titular: recuperaciones > 0 ? `Gana ${recuperaciones} ${recuperaciones === 1 ? 'recuperación' : 'recuperaciones'}` : 'No gana ninguna recuperación',
          detalle: !p.repartoAutomatico
            ? 'El reparto automático está apagado: nadie las concede solo.'
            : p.soloEnLaSemana
              ? 'La semana es la ventana: el hueco solo servía dentro de esa semana y no genera recuperación.'
              : derecho === 0
                ? p.vuelveAReservarLaMisma ? 'Volvió a apuntarse a esa clase: no perdió ninguna.' : huecoLibre === 0 ? 'No le queda hueco sin usar, así que no se compensa nada.' : 'Ninguna de sus cancelaciones compensa.'
                : 'Canceló a tiempo y se quedó con hueco sin usar: se le compensa.',
          tono: recuperaciones > 0 ? 'ok' : 'neutro' },
      ],
      porQue: [regla.barrido, regla.derecho, regla.ventana, regla.vuelve],
    },
  ];

  const comprobaciones: Comprobacion[] = [
    { id: 'no-mas-que-canceladas', descripcion: 'Nunca más recuperaciones que cancelaciones compensables.', ok: recuperaciones <= compensables.length },
    { id: 'no-mas-que-el-hueco', descripcion: 'Nunca más recuperaciones que hueco sin usar.', ok: recuperaciones <= huecoLibre },
    { id: 'ventana-no-concede', descripcion: 'Con «la semana es la ventana» no se concede ninguna.', ok: !p.soloEnLaSemana || recuperaciones === 0 },
    { id: 'semana-de-lunes-a-domingo', descripcion: 'La semana revisada empieza en lunes y termina en domingo.', ok: semana.desde === LUNES_DEMO && semana.hasta === sumarDias(LUNES_DEMO, 6) && diaMadrid(new Date(`${semana.hasta}T12:00:00Z`)) === semana.hasta },
  ];

  return {
    escenario: 'ausencia_recuperacion',
    titulo: 'Ausencia avisada y recuperación semanal',
    objetivo: 'Entender si una alumna con límite semanal gana una recuperación cuando avisa de que no va, y cómo cambia con «la semana es la ventana».',
    modulos: ['Reservas y cancelaciones', 'Recuperaciones', 'Planes con límite semanal'],
    reglasAplicables: [regla.tardia, regla.hueco, regla.derecho, regla.vuelve, regla.barrido, regla.ventana],
    entidades: [
      { tipo: 'Estudio', descripcion: `${ctx.estudio} (ficticio), con sus reglas de cancelación y recuperación.` },
      { tipo: 'Alumna', descripcion: `Alumna de ejemplo con cuota de ${p.limiteSemanal} a la semana.` },
      { tipo: 'Reservas', descripcion: `${p.clasesReservadas} reservadas, ${p.clasesCanceladas} canceladas.` },
    ],
    estadoInicial: `Semana con ${p.clasesReservadas} clases reservadas y límite de ${p.limiteSemanal}.`,
    acciones: [`Cancelar ${p.clasesCanceladas} (${haceCuanto(p.avisoHorasAntes)})`, 'Cerrar la semana el lunes'],
    resultadoEsperado: recuperaciones > 0 ? `Gana ${recuperaciones} recuperación(es).` : 'No gana ninguna recuperación.',
    pasos,
    excepciones: [
      'Una cancelación de una clase que nunca llegó a ocupar plaza (lista de espera, oferta rechazada) no compensa.',
      'Cancelar y volver a reservar la misma clase cuenta como una sola clase perdida, o ninguna.',
      'Las recuperaciones que da una persona a mano no pasan por esta regla.',
    ],
    comprobaciones,
  };
}
