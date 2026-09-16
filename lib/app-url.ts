// Auditoría 2026-09-16 (DEB-3): la misma función, `localhost:3001` de
// fallback y todo, vivía copiada cuatro veces (`lib/emails/plantillas-server.ts`,
// `lib/inngest/confirmacion-riesgo.ts`, `lib/inngest/valoraciones.ts`,
// `lib/sustituciones/contacto.ts`) — más otros ~25 sitios con el literal
// `http://localhost:300x` suelto, con dos puertos distintos según el fichero
// (3000 y 3001). Sin `NEXT_PUBLIC_APP_URL` puesta o mal escrita, nada falla:
// el enlace de un email o el `success_url` de un cobro apunta a localhost, la
// socia paga y aterriza en una página muerta, y el cobro sí se hizo.
//
// Fuente única. Consolidar los otros ~25 literales sueltos (fuera de este PR:
// tanda de revisión aparte, no un flip de una línea) puede ir migrando a esta
// función sin más cambio de comportamiento — el fallback es el mismo.
export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
}
