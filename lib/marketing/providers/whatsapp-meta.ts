import { enviarWhatsAppTexto } from '../../whatsapp.ts';
import type { WhatsAppCredenciales } from '../../whatsapp.ts';
import type { WhatsAppProvider } from './tipos.ts';

// WhatsAppProvider sobre la Meta Cloud API DEL ESTUDIO. Sustituye a
// `twilioSmsProvider`, que hablaba con una credencial de plataforma que nunca
// llegó a existir en producción.
//
// Es una fábrica y no un objeto suelto —mismo patrón que `resendEmailProvider(resend)`
// en este mismo directorio— porque las credenciales ya no son globales: cada
// estudio tiene las suyas, así que quien envía tiene que traerlas consigo. Esa
// es toda la diferencia, y es justo la que hace que este canal funcione.
//
// Sin `skipped`: con Twilio hacía falta para distinguir «no hay credenciales de
// plataforma» de «falló el envío». Aquí «no hay credenciales» ni siquiera
// llega a este punto — sin ellas no hay provider que construir, y el llamador
// lo resuelve antes (ver `whatsappDelEstudio`).
export function whatsappMetaProvider(creds: WhatsAppCredenciales): WhatsAppProvider {
  return {
    async enviar({ to, cuerpo }) {
      const r = await enviarWhatsAppTexto(creds, to, cuerpo);
      return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
    },
  };
}
