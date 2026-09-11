// ─────────────────────────────────────────────────────────────────────────────
// Qué hacer con un evento de Resend sobre un correo YA enviado.
//
// El bug que cierra esto: `resend.emails.send()` devuelve 200 y un id cuando
// ACEPTA la petición, no cuando entrega el correo. Lo que pasa después —rebote,
// queja, supresión— llega solo por webhook, y Tentare no tenía ninguno. De ahí
// «1 aviso enviado» sobre un correo que rebotó dos segundos más tarde.
//
// Módulo puro a propósito: la ruta del webhook arrastra Supabase y Resend, y
// la decisión de qué cuenta como buzón roto es justo lo que hay que poder
// probar con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoRebote = 'REBOTE' | 'QUEJA' | 'SUPRIMIDO';

export interface ReboteDetectado {
  email: string;
  tipo: TipoRebote;
  motivo: string | null;
  emailId: string | null;
}

/** Lo que hay que hacer con `email_rebotes` a raíz de un evento. */
export type EfectoEvento =
  | { accion: 'anotar'; rebotes: ReboteDetectado[] }
  /** Ha llegado de verdad: si la dirección estaba marcada, ya no lo está. */
  | { accion: 'olvidar'; emails: string[] }
  | { accion: 'ignorar' };

const IGNORAR: EfectoEvento = { accion: 'ignorar' };

/**
 * La clave de `email_rebotes` y la que se compara contra `socios.email`.
 * Sin esto, «Maria@Gmail.com» y «maria@gmail.com» serían dos buzones.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function destinatarios(data: unknown): string[] {
  const to = (data as { to?: unknown })?.to;
  const lista = Array.isArray(to) ? to : typeof to === 'string' ? [to] : [];
  return lista
    .filter((x): x is string => typeof x === 'string')
    .map(normalizarEmail)
    .filter(Boolean);
}

function idDelEnvio(data: unknown): string | null {
  const id = (data as { email_id?: unknown })?.email_id;
  return typeof id === 'string' && id ? id : null;
}

function texto(...candidatos: unknown[]): string | null {
  for (const c of candidatos) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

/**
 * Un rebote TRANSITORIO no es un buzón roto: el más común es el buzón lleno,
 * que se vacía solo. Marcarlo dejaría a una socia sin recibir nada por una
 * semana mala de su correo, así que solo cuentan los permanentes.
 *
 * ⚠️ Cuando el proveedor no dice de qué tipo es, se cuenta como PERMANENTE.
 * Es la dirección correcta del error: no anotarlo devuelve exactamente el
 * comportamiento que este módulo viene a arreglar —seguir diciendo «enviado»
 * a un buzón que no existe—, y lo único que hace anotarlo es que el panel
 * avise de que ese correo está dando problemas. No corta ningún envío de
 * servicio: `email_rebotes` solo lo consulta el aviso comercial de hueco.
 */
function esReboteDefinitivo(bounce: unknown): boolean {
  const tipo = (bounce as { type?: unknown })?.type;
  if (typeof tipo !== 'string' || !tipo.trim()) return true;
  return !tipo.trim().toLowerCase().startsWith('transient');
}

export function interpretarEventoResend(evento: unknown): EfectoEvento {
  const tipo = (evento as { type?: unknown })?.type;
  if (typeof tipo !== 'string') return IGNORAR;
  const data = (evento as { data?: unknown })?.data;
  const emails = destinatarios(data);
  if (emails.length === 0) return IGNORAR;
  const emailId = idDelEnvio(data);

  const anotar = (t: TipoRebote, motivo: string | null): EfectoEvento => ({
    accion: 'anotar',
    rebotes: emails.map(email => ({ email, tipo: t, motivo, emailId })),
  });

  switch (tipo) {
    case 'email.bounced': {
      const bounce = (data as { bounce?: unknown })?.bounce;
      if (!esReboteDefinitivo(bounce)) return IGNORAR;
      const b = bounce as { message?: unknown; type?: unknown; subType?: unknown } | undefined;
      return anotar('REBOTE', texto(b?.message, b?.subType, b?.type));
    }
    // Marcó el correo como spam. Es el caso más serio de todos: aquí no es que
    // no llegue, es que no debe volver a intentarse (LSSI art. 21 / RGPD 21.2),
    // aunque el consentimiento siga anotado en su ficha.
    case 'email.complained':
      return anotar('QUEJA', 'La persona marcó el correo como spam');
    // Resend lo descartó por su propia lista de supresión, sin intentarlo. Es
    // el que hace que un reenvío «funcione» (200 + id) y no llegue nunca.
    case 'email.suppressed': {
      const s = (data as { suppressed?: { message?: unknown; type?: unknown } })?.suppressed;
      return anotar('SUPRIMIDO', texto(s?.message, s?.type));
    }
    case 'email.delivered':
      return { accion: 'olvidar', emails };
    // `email.failed` es un fallo del ENVÍO (plantilla, adjunto, cuota), no del
    // buzón: apuntarlo aquí marcaría como rota una dirección que está bien.
    // El resto (sent/scheduled/opened/clicked/delivery_delayed, contactos,
    // dominios) no dice nada sobre si el buzón acepta correo.
    default:
      return IGNORAR;
  }
}

/** Lo que lee la propietaria. El texto crudo del proveedor va en inglés. */
export function motivoLegible(tipo: TipoRebote): string {
  switch (tipo) {
    case 'REBOTE': return 'Este correo rebotó: la dirección no existe o rechaza los mensajes';
    case 'QUEJA': return 'Marcó un correo anterior como spam';
    case 'SUPRIMIDO': return 'El proveedor de correo ya no acepta envíos a esta dirección';
  }
}
