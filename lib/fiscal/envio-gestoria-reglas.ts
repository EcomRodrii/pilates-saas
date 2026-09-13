// Quién puede mandar el cierre a la gestoría y A QUÉ DIRECCIÓN. Regla pura,
// sin Supabase, para poder probarla con `node --test`.
//
// El paquete lleva el libro de facturas del periodo (cliente, NIF, base, IVA y
// total por factura) y la ruta lo lee con service-role, así que la RLS no
// interviene. Antes bastaba `puedeVerFinanzas`: recepción podía mandarlo a
// cualquier dirección del body y, de paso, dejar esa dirección guardada en
// `studios.gestoria_email` — que es a donde el envío trimestral automático
// (`lib/inngest/cierre-gestoria-automatico.ts`) lo sigue mandando después, sin
// que nadie vuelva a mirar. Por la vía cliente la BD ya se lo negaba
// (`owner_studios`: solo PROPIETARIO escribe en `studios`).
//
// Reparto:
//   - PROPIETARIO: elige el destinatario y, si es distinto, pasa a ser el guardado.
//   - RECEPCION: solo al email ya guardado. Sin guardado, u otro distinto → 403.
//     Nunca cambia el guardado.
//   - Resto de roles: nada (lo mismo que `puedeVerFinanzas`).

import { puedeVerFinanzas } from '../permisos-reglas.ts';
import type { Rol } from '../types';

export const EMAIL_GESTORIA_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MENSAJES_ENVIO_GESTORIA = {
  sinPermiso: 'Solo la propietaria o recepción pueden enviar el cierre a la gestoría.',
  emailInvalido: 'Introduce un email de gestoría válido',
  sinEmailGuardado: 'Todavía no hay un email de gestoría guardado. Pide a la propietaria que lo configure enviando el primer cierre.',
  soloPropietariaCambia: 'Solo la propietaria puede cambiar el email de la gestoría. Envíalo al email que ya está guardado.',
} as const;

export type DecisionEnvioGestoria =
  | { ok: true; destinatario: string; cambiaGuardado: boolean }
  | { ok: false; status: 400 | 403; error: string };

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

export function decidirEnvioGestoria(input: {
  rol: Rol;
  emailPedido: string | null | undefined;
  emailGuardado: string | null | undefined;
}): DecisionEnvioGestoria {
  if (!puedeVerFinanzas(input.rol)) {
    return { ok: false, status: 403, error: MENSAJES_ENVIO_GESTORIA.sinPermiso };
  }
  const pedido = typeof input.emailPedido === 'string' ? input.emailPedido.trim() : '';
  const guardado = typeof input.emailGuardado === 'string' ? input.emailGuardado.trim() : '';

  if (input.rol === 'PROPIETARIO') {
    if (!EMAIL_GESTORIA_RE.test(pedido)) {
      return { ok: false, status: 400, error: MENSAJES_ENVIO_GESTORIA.emailInvalido };
    }
    return { ok: true, destinatario: pedido, cambiaGuardado: normalizar(pedido) !== normalizar(guardado) };
  }

  // Cualquier otro rol con finanzas (hoy solo RECEPCION): el destino no lo
  // decide él. Se manda al guardado tal cual está en la BD, no al del body.
  if (!EMAIL_GESTORIA_RE.test(guardado)) {
    return { ok: false, status: 403, error: MENSAJES_ENVIO_GESTORIA.sinEmailGuardado };
  }
  if (pedido !== '' && normalizar(pedido) !== normalizar(guardado)) {
    return { ok: false, status: 403, error: MENSAJES_ENVIO_GESTORIA.soloPropietariaCambia };
  }
  return { ok: true, destinatario: guardado, cambiaGuardado: false };
}

// Línea del feed de actividad (solo la ve la propietaria, RLS
// `owner_actividad_reciente`) cuando cambia el destinatario guardado.
export function textoCambioGestoria(anterior: string | null | undefined, nuevo: string): string {
  const antes = typeof anterior === 'string' && anterior.trim() !== '' ? anterior.trim() : 'ninguno';
  return `Email de la gestoría cambiado: ${antes} → ${nuevo.trim()}`;
}
