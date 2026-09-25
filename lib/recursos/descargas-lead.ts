// ─────────────────────────────────────────────────────────────────────────────
// Qué se escribe en `plataforma_lead` cuando alguien pide una descarga.
//
// Lógica pura, aparte de la ruta, para poder probar las reglas sin base de
// datos. Las reglas, y por qué:
//
//   · El formulario es público y el email no está verificado: cualquiera puede
//     escribir el de otra persona. Por eso un envío NO toca un lead que ya
//     existe: ni su origen, ni su estudio, ni sus notas, ni su `actualizado_en`
//     (que alimenta la alerta de «N días parado» del CRM). Solo anota el recurso
//     si no tenía ninguno, y deja un permiso pendiente si lo pide.
//   · Marcar «quiero novedades» deja el permiso PENDIENTE. Solo cuenta cuando la
//     dueña del email pulsa el botón del correo de ESA solicitud.
//   · A quien ya lo tiene confirmado no se le toca.
//   · Nada vuelve a null: ni la confirmación ni la baja. «¿Se le puede
//     escribir?» sale de comparar sus fechas (`puedeRecibirNovedades`), y el
//     historial completo vive aparte, solo de añadir
//     (`plataforma_lead_consentimiento`, migr 20260925184749).
//   · No marcar la casilla no es darse de baja. La baja va por su enlace.
// ─────────────────────────────────────────────────────────────────────────────

import { TEXTO_CONSENTIMIENTO_NOVEDADES } from './descargas.ts';

export interface EstadoNovedades {
  consentimiento_comercial: boolean;
  consentimiento_confirmado_en: string | null;
  baja_en: string | null;
}

export interface LeadExistente extends EstadoNovedades {
  id: string;
  recurso: string | null;
}

export interface PeticionDescarga {
  email: string;
  recurso: string;
  estudio: string | null;
  novedades: boolean;
}

export type EscrituraLead =
  | { tipo: 'insertar'; id: string; fila: Record<string, unknown> }
  | { tipo: 'actualizar'; id: string; cambios: Record<string, unknown> }
  | { tipo: 'nada'; id: string };

/**
 * ¿Se le pueden mandar novedades hoy? Permiso vigente, confirmado desde el
 * correo, y sin una baja posterior a esa confirmación.
 */
export function puedeRecibirNovedades(lead: EstadoNovedades): boolean {
  if (!lead.consentimiento_comercial || !lead.consentimiento_confirmado_en) return false;
  if (!lead.baja_en) return true;
  return Date.parse(lead.baja_en) < Date.parse(lead.consentimiento_confirmado_en);
}

/** ¿Hay que registrar una solicitud y pedir en el correo que la confirme? */
export function pedirConfirmacionNovedades(existente: EstadoNovedades | null, novedades: boolean): boolean {
  if (!novedades) return false;
  return !existente || !puedeRecibirNovedades(existente);
}

export function escrituraLeadDescarga(
  existente: LeadExistente | null,
  peticion: PeticionDescarga,
  ahora: string,
  nuevoId: () => string,
): EscrituraLead {
  const permisoPendiente = {
    consentimiento_comercial: true,
    consentimiento_texto: TEXTO_CONSENTIMIENTO_NOVEDADES,
    consentimiento_en: ahora,
  };

  if (!existente) {
    // El id va aparte y lo pone la ruta en la propia llamada: `plataforma_lead`
    // no tiene default y la guardia de lib/insert-id-explicito.test.ts tiene que verlo.
    return {
      tipo: 'insertar',
      id: nuevoId(),
      fila: {
        email: peticion.email,
        estudio: peticion.estudio,
        origen: 'DESCARGA',
        recurso: peticion.recurso,
        ...(peticion.novedades ? permisoPendiente : {}),
        actualizado_en: ahora,
      },
    };
  }

  const cambios: Record<string, unknown> = {};
  if (!existente.recurso) cambios.recurso = peticion.recurso;
  if (pedirConfirmacionNovedades(existente, peticion.novedades)) {
    // Solo el permiso mueve `actualizado_en`: es lo único que cambia de verdad
    // para quien lleva el lead.
    Object.assign(cambios, permisoPendiente, { actualizado_en: ahora });
  }
  return Object.keys(cambios).length
    ? { tipo: 'actualizar', id: existente.id, cambios }
    : { tipo: 'nada', id: existente.id };
}
