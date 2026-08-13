// Contrato del Provider Layer del Motor de Marketing — ver
// docs/marketing-integrations-arquitectura.md §1. No es un framework de
// plugins ni un registro dinámico: son los mismos envíos que ya hacía
// lib/inngest/automatizaciones.ts (Resend + Twilio, inline y duplicados
// entre procesarCandidato y procesarCandidatoMkt), con un contrato formal
// para que un proveedor nuevo (Klaviyo/Brevo/Mailchimp/otro SMS) lo
// implemente sin tocar esos dos call sites.

export interface ResultadoEnvioProvider {
  ok: boolean;
  id?: string;
  // No configurado (faltan credenciales) — distinto de un fallo real del
  // proveedor, mismo matiz que ya distinguían lib/twilio.ts y
  // lib/emails/send-server.ts.
  skipped?: boolean;
  error?: string;
}

export interface EmailProvider {
  enviar(params: {
    to: string;
    subject: string;
    html: string;
    studioNombre: string;
    // Resend deduplica envíos con la misma clave 24h — ver
    // lib/emails/send-server.ts para el mismo criterio.
    idempotencyKey?: string;
  }): Promise<ResultadoEnvioProvider>;
}

export interface SmsProvider {
  enviar(params: {
    canal: 'WHATSAPP' | 'SMS';
    to: string | null | undefined;
    cuerpo: string;
  }): Promise<ResultadoEnvioProvider>;
}
