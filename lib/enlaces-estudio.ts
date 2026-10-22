// ─────────────────────────────────────────────────────────────────────────────
// Las DOS puertas públicas de un estudio, y cuál se da por defecto.
//
//   · `/portal/<slug>`   LA APP DE SUS ALUMNAS (marca blanca, instalable; la
//                        alumna entra con su email y un código de 6 cifras y
//                        desde ahí reserva, compra y ve su bono). Es el enlace
//                        y el QR que Tentare le da —y le manda— a un estudio
//                        para que lo pase a sus alumnas: Instagram, WhatsApp,
//                        la puerta, los folletos, los correos del alta.
//   · `/reservar/<slug>` LA PÁGINA DE RESERVAS, la que el estudio INTEGRA EN SU
//                        WEB (botón o widget, «Mi web»). No es lo que se
//                        comparte por defecto con las alumnas (decisión del
//                        fundador, 22-oct-2026).
//
// Quien necesite «el enlace para pasárselo a las alumnas» llama a `rutaApp`;
// quien hable de la web del estudio, a `rutaPaginaReservas`. Los guardias de
// `enlace-por-defecto.test.ts` vigilan que el alta, la guía y los correos no
// vuelvan a repartir la segunda.
//
// Puro y sin imports: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

/** La ruta de la app de las alumnas: el enlace por defecto para compartir. */
export function rutaApp(slug: string): string {
  return `/portal/${encodeURIComponent(slug)}`;
}

/** La ruta de la página de reservas: la que se integra en la web del estudio. */
export function rutaPaginaReservas(slug: string): string {
  return `/reservar/${encodeURIComponent(slug)}`;
}

/** El PNG del QR de la app (el que lleva el correo): `/api/public/qr-app/<slug>`. */
export function rutaQrApp(slug: string): string {
  return `/api/public/qr-app/${encodeURIComponent(slug)}`;
}

/** La forma de un slug de estudio que sirve el QR (el mismo juego de caracteres que la dirección). */
export const SLUG_PARA_QR = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** `base` sin barras finales + `ruta`: el enlace absoluto que se copia o se manda. */
export function urlAbsoluta(base: string, ruta: string): string {
  return `${base.replace(/\/+$/, '')}${ruta}`;
}
