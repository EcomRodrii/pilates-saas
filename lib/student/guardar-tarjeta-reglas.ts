// «Cambiar tarjeta» / «Añadir tarjeta» en Perfil → Método de pago (6-oct-2026).
//
// Parte PURA de la hoja: traduce lo que contesta el servidor. Sin imports de
// servidor ni alias `@/`: la comparten la hoja y sus tests (`node --test`).
//
// ⚠️ La regla es la de siempre en este repo: que el Checkout de Stripe diga
// «hecho» NO es que la tarjeta esté. La escribe el webhook en la ficha, y solo
// cuando `GET /api/public/tarjeta?sesion=` contesta `guardada` se le dice a la
// alumna «Tarjeta guardada».

import { leerEstadoCompra } from './estado-compra-reglas.ts';

export { esperaAntesDe } from './estado-compra-reglas.ts';

export interface TarjetaConfirmada {
  marca: string | null;
  ultimos4: string | null;
  caducidad: string | null;
}

/** Lo que dice UNA consulta, ya traducido. */
export type LecturaTarjeta =
  | { tipo: 'guardada'; tarjeta: TarjetaConfirmada }
  /** Aún no está en su ficha (o no se ha podido saber): se sigue preguntando. `esperaMinMs`: lo que pidió el servidor. */
  | { tipo: 'en_proceso'; esperaMinMs?: number }
  | { tipo: 'sesion' }
  | { tipo: 'dos-pasos' };

export function leerConfirmacionTarjeta(status: number, retryAfter: string | null, cuerpo: unknown): LecturaTarjeta {
  const base = leerEstadoCompra(status, retryAfter, cuerpo);
  if (base.tipo === 'sesion' || base.tipo === 'dos-pasos') return base;
  if (base.tipo === 'en_proceso' && base.esperaMinMs) return base;
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { confirmacion?: unknown; tarjeta?: unknown };
  if (status >= 200 && status < 300 && c.confirmacion === 'guardada') {
    const t = (c.tarjeta && typeof c.tarjeta === 'object' ? c.tarjeta : {}) as Record<string, unknown>;
    const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
    return { tipo: 'guardada', tarjeta: { marca: texto(t.marca), ultimos4: texto(t.ultimos4), caducidad: texto(t.caducidad) } };
  }
  // `confirmando`, `sin_completar`, un 500, un 404 o un cuerpo raro: todavía no se sabe.
  // Nunca «guardada» sin que el servidor lo diga.
  return { tipo: 'en_proceso' };
}

/** Lo que se le dice al guardarla: «Mastercard •••• 4444». */
export function textoTarjeta(t: TarjetaConfirmada): string {
  const marca = t.marca ? `${t.marca.charAt(0).toUpperCase()}${t.marca.slice(1)} ` : '';
  return t.ultimos4 ? `${marca}•••• ${t.ultimos4}` : 'Tu tarjeta';
}
