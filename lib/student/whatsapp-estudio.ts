import { telefonoE164 } from '../decision/mensajes-socia.ts';

// «Reservar o cancelar por WhatsApp» (nov-2026): un enlace wa.me al chat del estudio con el
// mensaje ya escrito, para la alumna que no quiere usar la app. NO es un bot: lo contesta una
// persona del estudio, que reserva o cancela desde el panel. Quien responde y qué hace no cambia
// ninguna regla de reserva.
//
// ⚠️ Solo con un MÓVIL. El teléfono del estudio es el que se enseña en la ficha y puede ser un
// fijo, y a un fijo wa.me no lleva a ningún chat: la alumna tocaría el botón y vería «número no
// disponible». Sin móvil conocido, no hay botón (mejor nada que un enlace roto).

const MENSAJE = 'Hola, quería reservar o cancelar una clase.';

/** El enlace al chat, o `null` si el teléfono no es de un móvil que WhatsApp pueda abrir. */
export function enlaceWhatsAppEstudio(telefono: string | null | undefined): string | null {
  const e164 = telefonoE164(telefono);
  if (!e164) return null;
  const digitos = e164.slice(1);
  if (!/^\d{8,15}$/.test(digitos)) return null;
  // Nueve dígitos y sin prefijo de país: es un número nacional al que `telefonoE164` no pudo poner
  // el +34 por no ser un móvil (un fijo). Sin esto saldría `wa.me/950123456`, un número inventado.
  if (digitos.length === 9) return null;
  // España: un móvil empieza por 6 o 7. Un 8 o 9 es un fijo y no tiene WhatsApp.
  if (digitos.startsWith('34') && !/^34[67]\d{8}$/.test(digitos)) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(MENSAJE)}`;
}
