import type { NextRequest } from 'next/server';
import { verificarSesionStaff, verificarUsuarioSupabase } from '@/lib/auth-server';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';

// Fuente ÚNICA de "¿puede quien llama actuar sobre la ficha de esta socia?".
//
// Por qué existe (auditoría 22-ago): los dos endpoints de `mode: 'setup'`
// —/api/stripe/setup-tarjeta y su gemelo /api/stripe/setup-sepa— solo
// comprobaban `socio.studio_id === body.studioId`. Es decir: bastaba conocer
// (o acertar) un `socioId` del estudio para abrir un Checkout de autorización
// y que el webhook escribiera el `stripe_payment_method_id` de QUIEN LLAMA
// sobre la ficha ajena. No mueve dinero al hacerlo, pero secuestra el
// instrumento con el que se cobrará después.
//
// Los tres llamantes, comprobados uno a uno contra el `main` del 23-ago (NO
// asumido — la versión anterior de este comentario daba por hecho algo falso):
//  · `crearEnlaceTarjeta` (panel de cobros) → ya manda `authHeader()`, staff.
//  · `urlParaGuardarTarjeta` (portal)       → ya manda `portalAuthHeader()`.
//  · `iniciarDomiciliacionSepa` (portal)    → NO mandaba nada. `postCheckout`
//    NO adjunta la cabecera por su cuenta, la recibe como 3er argumento, y
//    esta llamada no se lo pasaba. Se le añade en lib/api-client.ts como parte
//    de este mismo cambio: sin eso, exigir el JWT aquí rompería la
//    domiciliación SEPA de todas las socias.
// La ruta del portal está gateada por sesión (app/portal/[slug]/compras/
// page.tsx:49 `session?.socioId`), así que el JWT siempre existe.
//
// Vive aquí y no copiado en cada ruta a propósito: el fallo recurrente de este
// repo es arreglar un endpoint y no su gemelo.
export type SociaAutorizada =
  | { ok: true; socioId: string }
  | { ok: false; status: 401 | 403; error: string };

export async function autorizarSobreSocia(
  req: NextRequest,
  studioId: string,
  socioIdPedido: string,
): Promise<SociaAutorizada> {
  // Camino 1 — staff del estudio: puede preparar el enlace para cualquier
  // socia SUYA (es justo el caso de "Cobrar online" → SIN_TARJETA → mandar el
  // enlace). El `studioId` se compara con el de la sesión, no con el del body.
  const staff = await verificarSesionStaff(req);
  if (staff) {
    if (staff.studioId !== studioId) {
      return { ok: false, status: 403, error: 'No autorizado' };
    }
    return { ok: true, socioId: socioIdPedido };
  }

  // Camino 2 — la propia socia desde el portal: el id sale de SU JWT, nunca
  // del body, y tiene que coincidir con el que pide.
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) {
    return { ok: false, status: 401, error: 'Inicia sesión para continuar.' };
  }
  const suyo = await socioAutenticado(usuario.userId, studioId);
  if (!suyo || suyo !== socioIdPedido) {
    return { ok: false, status: 403, error: 'No autorizado' };
  }
  return { ok: true, socioId: suyo };
}
