// Contrato del Provider Layer del Motor de Marketing — ver
// docs/marketing-integrations-arquitectura.md §1. No es un framework de
// plugins ni un registro dinámico: son los mismos envíos que ya hacía
// lib/inngest/automatizaciones.ts (Resend + Twilio, inline y duplicados
// entre procesarCandidato y procesarCandidatoMkt), con un contrato formal
// para que un proveedor nuevo (Klaviyo/Brevo/Mailchimp/otro SMS) lo
// implemente sin tocar esos dos call sites.
//
// Desde 2026-09-09 el proveedor de mensajería es la Meta Cloud API de cada
// estudio (`whatsapp-meta.ts`); el de Twilio se retiró junto con el resto del
// canal — ver WHATSAPP_AUDIT.md §0.

export interface ResultadoEnvioProvider {
  ok: boolean;
  id?: string;
  // No configurado (faltan credenciales) — distinto de un fallo real del
  // proveedor, mismo matiz que ya distingue lib/emails/send-server.ts. Solo lo
  // usa el proveedor de email: en WhatsApp «sin credenciales» se resuelve antes
  // de construir el proveedor (ver whatsapp-meta.ts).
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

export interface WhatsAppProvider {
  enviar(params: {
    // Sin `canal`: Meta no manda SMS, y el parámetro solo servía para elegir
    // entre los dos remitentes de Twilio. El canal SMS se retiró entero (nunca
    // entregó un mensaje en producción: 0 campañas SMS y 0 filas en
    // `notification_delivery`), así que aquí ya solo hay una opción.
    to: string | null | undefined;
    cuerpo: string;
  }): Promise<ResultadoEnvioProvider>;
}
