// «Avisar por WhatsApp» a quien está en el equipo y todavía no tiene acceso
// (P3.14, opción B del diseño 20; decisión de la noche del 13-oct-2026).
//
// ⚠️ El WhatsApp NUNCA lleva el enlace de invitación (`/invitacion?token=`).
// Un número mal tecleado o un reenvío a un grupo y el enlace estaría en otras
// manos; por correo, el límite es el buzón. Por eso:
//   · A una INSTRUCTORA se le manda la pantalla «¿Cómo quieres entrar?» de la app
//     del estudio (`/portal/<slug>/acceso/elegir`: con sesión se lo pregunta al
//     servidor; la de inicio no, y a quien ya es alumna la dejaba en su inicio
//     de alumna sin preguntarle nada) y qué pulsar. Esa puerta
//     (`/api/portal/instructora/unirse`, sin enlace) ya exige entrar con el
//     correo VERIFICADO de su ficha y solo vale para INSTRUCTOR: el WhatsApp no
//     abre nada que no estuviera abierto.
//   · A GERENCIA o RECEPCIÓN solo se le dice que mire el correo, y solo después
//     de haberle mandado la invitación (si no, el mensaje mentiría).
// El correo va tapado (`an•••@dominio`): el mensaje puede acabar en otro chat.
//
// Puro: lo prueba el runner de Node.

import { enlaceWhatsApp } from '../decision/mensajes-socia.ts';
import { enmascararCorreo } from '../student/entrada-codigo.ts';

export interface DatosAvisoWhatsApp {
  /** Nombre de la ficha (se usa el primero). */
  nombre: string;
  /** Rol de la ficha. */
  rol: string;
  /** Una ficha inactiva no puede entrar por ninguna puerta: decírselo mentiría. */
  activo: boolean;
  /** Correo de la ficha: sin él no hay acceso que avisar. */
  email: string | null | undefined;
  telefono: string | null | undefined;
  /** Nombre del estudio, tal como lo ve ella. */
  estudio: string;
  /** «¿Cómo quieres entrar?» en la app del estudio, absoluta (`https://…/portal/<slug>/acceso/elegir`). */
  urlApp: string;
  /** ¿Se le acaba de mandar la invitación por correo en esta pantalla? */
  invitacionEnviada: boolean;
}

const primerNombre = (n: string) => n.trim().split(/\s+/)[0] || n.trim();

/** El texto del WhatsApp, o `null` si no hay nada cierto que decirle. */
export function mensajeInvitacionWhatsApp(d: DatosAvisoWhatsApp): string | null {
  const email = (d.email ?? '').trim();
  // Sin «@» no es un correo: ni se podría entrar con él ni se tapa al enmascararlo.
  if (!email || !email.includes('@') || !d.activo) return null;
  const hola = `Hola ${primerNombre(d.nombre)}`;
  const correo = enmascararCorreo(email);
  if (d.rol === 'INSTRUCTOR') {
    return `${hola}, te he dado acceso a ${d.estudio} en Tentare. Entra en la app del estudio con tu correo ${correo} y, cuando te pregunte cómo quieres entrar, elige «Como instructora»: ${d.urlApp}`;
  }
  if (!d.invitacionEnviada) return null;
  return `${hola}, te acabo de mandar a ${correo} la invitación para entrar en ${d.estudio} en Tentare. Ábrela desde ese correo (si no la ves, mira en spam).`;
}

/** El enlace wa.me con el +34 de un móvil español; sin teléfono, que elija el chat. */
export function enlaceInvitacionWhatsApp(d: DatosAvisoWhatsApp): string | null {
  const texto = mensajeInvitacionWhatsApp(d);
  if (!texto) return null;
  return enlaceWhatsApp(d.telefono, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
