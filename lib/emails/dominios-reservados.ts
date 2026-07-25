// Dominios reservados por la RFC 2606 (+ la variante castellana que usan
// nuestros datos de demo). Resend los rechaza siempre con "Invalid `to` field.
// Please use our testing email address instead of domains like example.com":
// un error suyo, en inglés, que a la propietaria de un estudio no le dice nada.
//
// En producción esto eran ~16 fallos diarios contra socias de demo, que llenaban
// de rojo el registro de acciones y tapaban los fallos de verdad. Detectarlo
// antes ahorra la llamada y permite dar un mensaje accionable.
//
// En módulo aparte para poder testearlo: lib/inngest/automatizaciones.ts arrastra
// Inngest, Resend y Supabase, y no se puede importar desde `node --test`.
const DOMINIOS_RESERVADOS = [
  'example.com',
  'example.org',
  'example.net',
  'ejemplo.com',
  'test',
  'invalid',
  'localhost',
];

export function esDominioReservado(email: string | null | undefined): boolean {
  const dominio = email?.split('@')[1]?.trim().toLowerCase();
  if (!dominio) return false;
  return DOMINIOS_RESERVADOS.some(d => dominio === d || dominio.endsWith(`.${d}`));
}
