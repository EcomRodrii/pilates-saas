// Mensajes ORIENTADOS A LA SOCIA para las recomendaciones de contacto manual.
// El `motivo`/`textoSugerido` de una recomendación está redactado para el
// PROPIETARIO ("lleva 18 días sin aparecer, yo le escribiría") — enviárselo tal
// cual a la socia sería absurdo. Aquí se genera el mensaje cálido y correcto que
// de verdad se le manda (por email al aprobar, o por WhatsApp con un clic).
// Módulo PURO (sin red ni imports de servidor): lo usan el ejecutor (Inngest) y
// la tarjeta del Centro de Control (navegador).

export interface MensajeSocia {
  asunto: string; // para el email
  cuerpo: string; // texto del mensaje (email y WhatsApp comparten cuerpo)
}

type Datos = Record<string, string | number | boolean>;

/**
 * Devuelve el mensaje para la socia según el tipo de recomendación, o null si el
 * tipo no es de contacto directo a una socia (p.ej. avisos de horario).
 */
export function mensajeParaSocia(tipo: string, datos: Datos, estudioNombre: string): MensajeSocia | null {
  const nombre = typeof datos.nombre === 'string' && datos.nombre.trim() ? datos.nombre.trim() : null;
  if (!nombre) return null;
  const estudio = estudioNombre.trim() || 'el estudio';

  switch (tipo) {
    case 'RECUPERAR_SOCIA':
      return {
        asunto: `Te echamos de menos en ${estudio}`,
        cuerpo: `¡Hola ${nombre}! Te hemos echado de menos estas semanas en ${estudio}. ¿Va todo bien? Nos encantaría volver a verte pronto — dime y te guardo sitio en la próxima clase.`,
      };
    case 'CONTACTAR_LEAD':
      return {
        asunto: `¿Te animas a probar ${estudio}?`,
        cuerpo: `¡Hola ${nombre}! Vimos que te interesó ${estudio}. ¿Te apetece que te reserve una clase esta semana para que nos conozcas? Sin compromiso, solo para que lo pruebes.`,
      };
    case 'CONVERTIR_PRUEBA':
      return {
        asunto: `¿Seguimos, ${nombre}?`,
        cuerpo: `¡Hola ${nombre}! ¿Qué tal te está resultando la prueba en ${estudio}? Si te apetece seguir, te preparo un plan a tu medida para que no pierdas el ritmo. Cuéntame y lo vemos.`,
      };
    case 'PROPONER_RENOVACION_BONO':
      return {
        asunto: `¿Renovamos tu bono, ${nombre}?`,
        cuerpo: `¡Hola ${nombre}! Se te está acabando el bono en ${estudio}. ¿Te preparo uno nuevo para que no pierdas el ritmo? Dime y lo dejamos listo.`,
      };
    // ENVIAR_REACTIVACION es el tipo con MÁS autonomía declarada (2) y acción
    // ENVIAR_EMAIL: es el primero que el piloto automático manda solo. Sin este
    // caso, mensajeParaSocia devolvía null y el ejecutor acababa enviándole a la
    // socia el texto del propietario ("¿Le ofrecemos una vuelta con descuento a
    // Marta?"). El descuento sale de datosUsados — nunca se inventa aquí.
    case 'ENVIAR_REACTIVACION': {
      const pct = typeof datos.descuentoPct === 'number' && datos.descuentoPct > 0 ? datos.descuentoPct : null;
      return {
        asunto: `Te echamos de menos, ${nombre}`,
        cuerpo: `¡Hola ${nombre}! Hace unas semanas que no te vemos por ${estudio} y nos encantaría que volvieras.${pct ? ` Te guardamos un ${pct}% de descuento en tu próxima renovación para ponértelo fácil.` : ''} ¿Te reservo sitio esta semana?`,
      };
    }
    case 'CONGELAR_MEMBRESIA':
      return {
        asunto: `¿Te viene bien una pausa, ${nombre}?`,
        cuerpo: `¡Hola ${nombre}! Hemos notado que llevas un tiempo sin poder venir a ${estudio}. Si ahora te va mal, podemos congelarte la cuota una temporada — así no pagas de más y retomas cuando quieras, sin perder tu sitio. ¿Te lo preparo?`,
      };
    case 'COBRAR_PENDIENTE': {
      const total = typeof datos.total === 'number' ? datos.total : null;
      return {
        asunto: `Un recordatorio de ${estudio}`,
        cuerpo: `¡Hola ${nombre}! Un recordatorio suave: te quedó un pago pendiente${total ? ` de ${total}€` : ''} en ${estudio}. ¿Lo dejamos resuelto? Si necesitas cualquier cosa, aquí estoy.`,
      };
    }
    default:
      return null;
  }
}

/**
 * Normaliza un teléfono a formato E.164 (`+34612345678`). `telefono` puede venir
 * con +, espacios, guiones, etc. Devuelve null si no hay dígitos. Es PURO — lo
 * usan tanto el enlace wa.me (navegador) como el envío por Twilio (servidor).
 */
export function telefonoE164(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const teniaPrefijoIntl = telefono.trim().startsWith('+') || telefono.trim().startsWith('00');
  let digitos = telefono.replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.startsWith('00')) digitos = digitos.slice(2); // 00 internacional → sin él
  // Móvil español sin prefijo internacional (9 dígitos, empieza por 6/7) → +34.
  if (!teniaPrefijoIntl && digitos.length === 9 && /^[67]/.test(digitos)) digitos = `34${digitos}`;
  return `+${digitos}`;
}

/** Enlace wa.me con el mensaje prerrellenado. `telefono` puede venir con +, espacios, etc. */
export function enlaceWhatsApp(telefono: string | null | undefined, cuerpo: string): string | null {
  const e164 = telefonoE164(telefono);
  if (!e164) return null;
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(cuerpo)}`;
}
