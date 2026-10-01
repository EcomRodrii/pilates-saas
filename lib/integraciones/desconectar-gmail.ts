// Desconectar Gmail (retirado el 1-oct-2026, lib/gmail.ts) sin romper Google
// Calendar.
//
// Las dos entran con la MISMA app de Google (NEXT_PUBLIC_GOOGLE_CLIENT_ID), y
// Google no retira permisos sueltos: revocar un token le quita a la app todo lo
// que esa cuenta le había dado, Calendar incluido. Desconectar Gmail revocando
// dejaba Calendar «conectado» pero muerto —la siguiente sincronización fallaba—,
// y justo en los dos estudios que tenían Gmail, que tienen Calendar con la misma
// cuenta. Con Calendar en esa cuenta, solo se borra lo de Gmail: el token de
// Calendar se pide sin `include_granted_scopes`, así que no lleva los permisos
// de Gmail, y sin el de Gmail Tentare no tiene forma de entrar en él.

/**
 * ¿Se revoca el permiso en Google al desconectar Gmail? Ante la duda, no:
 * Calendar funcionando vale más que limpiar un permiso que ya no usamos.
 */
export function revocarGmailEnGoogle(e: {
  gmailEmail: string | null | undefined;
  calendarConectado: boolean;
  calendarEmail: string | null | undefined;
}): boolean {
  if (!e.calendarConectado) return true;
  const gmail = e.gmailEmail?.trim().toLowerCase();
  const calendar = e.calendarEmail?.trim().toLowerCase();
  // Con cuentas distintas, revocar la de Gmail no toca la de Calendar.
  return !!gmail && !!calendar && gmail !== calendar;
}
