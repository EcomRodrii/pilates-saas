import type { RowConversaciones } from '@/lib/db-types';
import type { ResumenConversacion } from './presentacion.ts';

// La UI (pestaña "Conversaciones" de /mensajeria) necesita un nombre legible
// por fila y la RPC/tabla no lo trae — en vez de un endpoint aparte,
// GET /api/mensajeria/conversaciones embebe `conversacion_participantes`
// (mismo cliente de sesión, misma RLS ya verificada por seguridad) para
// resolver socio_id/auth_user_id en el cliente contra
// useStudio().socios/instructores, sin tabla ni JOIN nuevo. Tipo en su propio
// módulo (no exportado desde el route.ts) porque un Route Handler de
// app/api/ solo debe exportar los métodos HTTP reconocidos.
export type RowConversacionesConParticipantes = RowConversaciones & {
  conversacion_participantes: {
    socio_id: string | null;
    rol_en_conversacion: string;
    auth_user_id: string;
    /** Rediseño de la mensajería: alimenta el "sin leer" de la bandeja y el
     *  doble check del hilo. Ver lib/mensajeria/presentacion.ts. */
    leido_hasta: string;
  }[];
};

/** Lo que devuelve de verdad GET /api/mensajeria/conversaciones. */
export type ConversacionStaff = RowConversacionesConParticipantes & ResumenConversacion;
