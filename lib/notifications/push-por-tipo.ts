// ─────────────────────────────────────────────────────────────────────────────
// Push por TIPO de aviso (client-safe): qué puede apagar cada persona desde su
// app y cómo se resuelve contra la preferencia de la categoría.
//
// La preferencia vive en `notification_preference.push_eventos` (migr
// 20260921132122): excepciones por tipo dentro de la fila de su categoría. Un
// tipo sin excepción hereda el `push` de la categoría, así que quien ya había
// apagado una categoría entera la sigue viendo apagada tipo a tipo.
//
// Los rótulos describen lo que dice el push de verdad (`PLANTILLAS` del
// catálogo). `push-por-tipo.test.ts` falla si aparece un push nuevo para la
// alumna o la instructora que no esté aquí: sin eso nacería sin interruptor.
// ─────────────────────────────────────────────────────────────────────────────
import { EVENTOS } from './catalog.ts';

export interface TipoPush {
  evento: string;
  titulo: string;
  detalle?: string;
}

export interface GrupoPush {
  titulo: string;
  tipos: TipoPush[];
}

export type RolConPushPorTipo = 'SOCIA' | 'INSTRUCTOR';

export const PUSH_POR_TIPO: Record<RolConPushPorTipo, GrupoPush[]> = {
  SOCIA: [
    {
      titulo: 'Recordatorios de clase',
      tipos: [
        { evento: EVENTOS.RECORDATORIO_24H, titulo: 'Con antelación', detalle: 'El primero que te llega de cada clase' },
        { evento: EVENTOS.RECORDATORIO_1H, titulo: 'Justo antes de la clase' },
      ],
    },
    {
      titulo: 'Tus reservas',
      tipos: [
        { evento: EVENTOS.RESERVA_CONFIRMADA, titulo: 'Reserva confirmada' },
        {
          evento: EVENTOS.RESERVA_OFERTA_LISTA_ESPERA, titulo: 'Plaza libre en la lista de espera',
          detalle: 'Tienes un plazo para aceptarla: sin este aviso puedes perderla',
        },
        { evento: EVENTOS.RESERVA_PLAZA_LIBERADA, titulo: 'Plaza conseguida desde la lista de espera' },
        { evento: EVENTOS.RESERVA_PLAZA_FIJA_NO_MATERIALIZADA, titulo: 'Tu clase fija no se ha podido reservar' },
        { evento: EVENTOS.PLAZA_FIJA_RESPUESTA, titulo: 'Respuesta a tu petición de clase fija' },
        { evento: EVENTOS.RECUPERACION_OTORGADA, titulo: 'Clases para recuperar' },
        { evento: EVENTOS.VALORAR_CLASE, titulo: 'Valorar la clase después de ir' },
      ],
    },
    {
      titulo: 'Cambios en tus clases',
      tipos: [
        { evento: EVENTOS.CLASE_CANCELADA, titulo: 'Clase cancelada' },
        { evento: EVENTOS.CLASE_MODIFICADA, titulo: 'Cambio de hora o sala' },
        { evento: EVENTOS.CLASE_SUSTITUTA, titulo: 'Otra instructora da tu clase' },
      ],
    },
    {
      titulo: 'Bonos y pagos',
      tipos: [
        { evento: EVENTOS.BONO_POR_CADUCAR, titulo: 'Bono a punto de caducar' },
        { evento: EVENTOS.BONO_AGOTADO, titulo: 'Bono agotado' },
        { evento: EVENTOS.PAGO_FALLIDO, titulo: 'Problema con un pago' },
        { evento: EVENTOS.PAGO_PENALIZACION, titulo: 'Cargo por cancelación tardía' },
        { evento: EVENTOS.SUSCRIPCION_PRECIO_SUBE, titulo: 'Cambio de precio de tu cuota' },
      ],
    },
    {
      titulo: 'Mensajes',
      tipos: [
        { evento: EVENTOS.MENSAJE_RECIBIDO, titulo: 'Mensajes nuevos' },
        { evento: EVENTOS.POST_COMUNIDAD_NUEVO, titulo: 'Novedades en el tablón' },
        { evento: EVENTOS.DOCUMENTO_SOCIO_NUEVO, titulo: 'Documentos nuevos' },
      ],
    },
  ],
  INSTRUCTOR: [
    {
      titulo: 'Tus clases',
      tipos: [
        { evento: EVENTOS.CLASE_CANCELADA, titulo: 'Clase cancelada' },
        { evento: EVENTOS.CLASE_MODIFICADA, titulo: 'Cambio de hora o sala' },
      ],
    },
    {
      titulo: 'Sustituciones',
      tipos: [
        { evento: EVENTOS.SUSTITUCION_OFRECIDA, titulo: 'Te piden cubrir una clase' },
        { evento: EVENTOS.SUSTITUCION_ACEPTADA, titulo: 'Clase nueva asignada' },
        { evento: EVENTOS.BAJA_REVISADA, titulo: 'El estudio ha revisado tu aviso de baja' },
      ],
    },
    {
      titulo: 'Mensajes',
      tipos: [
        { evento: EVENTOS.MENSAJE_RECIBIDO, titulo: 'Mensajes nuevos' },
      ],
    },
    {
      titulo: 'Tentare Network',
      tipos: [
        { evento: EVENTOS.RED_VACANTE_ENCAJA, titulo: 'Vacantes que encajan contigo' },
        { evento: EVENTOS.RED_CONTACTO_SOLICITADO, titulo: 'Un estudio quiere contactar contigo' },
        { evento: EVENTOS.RED_CONTACTO_ACEPTADO, titulo: 'Aceptan tu solicitud de contacto' },
        { evento: EVENTOS.RED_EXPERIENCIA_CONFIRMADA, titulo: 'Experiencia verificada' },
        { evento: EVENTOS.RED_EXPERIENCIA_RECHAZADA, titulo: 'Experiencia no confirmada' },
      ],
    },
  ],
};

const EDITABLES = new Set(
  Object.values(PUSH_POR_TIPO).flatMap(grupos => grupos.flatMap(g => g.tipos.map(t => t.evento))),
);

export function esPushEditable(evento: string): boolean {
  return EDITABLES.has(evento);
}

/** La excepción del tipo si la hay; si no, lo que diga su categoría. */
export function pushEfectivo(pushCategoria: boolean, pushEventos: unknown, evento: string): boolean {
  if (pushEventos && typeof pushEventos === 'object' && !Array.isArray(pushEventos)) {
    const v = (pushEventos as Record<string, unknown>)[evento];
    if (typeof v === 'boolean') return v;
  }
  return pushCategoria;
}
