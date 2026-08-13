import { enviarMensajeTwilio } from '@/lib/twilio';
import type { SmsProvider } from './tipos.ts';

// SmsProvider sobre Twilio — delegación fina, sin lógica nueva:
// enviarMensajeTwilio ya distingue skipped (sin configurar) de error real.
export const twilioSmsProvider: SmsProvider = {
  async enviar({ canal, to, cuerpo }) {
    const r = await enviarMensajeTwilio({ canal, to, cuerpo });
    return { ok: r.ok, id: r.id, skipped: r.skipped, error: r.error };
  },
};
