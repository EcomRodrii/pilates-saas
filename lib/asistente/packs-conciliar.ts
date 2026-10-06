// ─────────────────────────────────────────────────────────────────────────────
// Red de seguridad de los packs de consultas: si el webhook de la plataforma
// no entrega (ya pasó: su secreto estuvo caducado del 18 al 21 de agosto y nadie
// se enteró), un pack pagado no llegaría nunca. Este barrido lo corre el
// conciliador de cobros que YA existe (lib/inngest/conciliar-cobros.ts, cada
// hora): sin cron nuevo, Inngest va justo de cuota.
//
// Mira las sesiones de Checkout COMPLETAS de las últimas 72 h de la cuenta de
// PLATAFORMA, se queda con las de packs pagados y las acredita con la misma
// decisión y la misma escritura que el webhook (idempotentes: si el webhook ya
// lo hizo, no pasa nada). Una sesión cuyo cargo tiene algo devuelto o
// disputado NO se acredita aquí: eso lo resuelve una persona.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decidirAcreditacion, esDePack } from './packs-stripe.ts';
import { acreditarPack } from './packs-libro.ts';

const VENTANA_HORAS = 72;
const TECHO = 2000;

export interface ResultadoBarrido { vistas: number; acreditados: string[]; sinTocar: string[]; techo: boolean }

export async function barrerPacksSinAcreditar(
  admin: Pick<SupabaseClient, 'from'>,
  stripe: { checkout: { sessions: Pick<Stripe['checkout']['sessions'], 'list'> } },
  ahoraMs = Date.now(),
): Promise<ResultadoBarrido> {
  const r: ResultadoBarrido = { vistas: 0, acreditados: [], sinTocar: [], techo: false };
  const desde = Math.floor(ahoraMs / 1000) - VENTANA_HORAS * 3600;
  for await (const s of stripe.checkout.sessions.list({
    created: { gte: desde }, status: 'complete', limit: 100, expand: ['data.payment_intent.latest_charge'],
  })) {
    if (++r.vistas > TECHO) { r.techo = true; break; }
    if (!esDePack(s)) continue;
    const d = decidirAcreditacion(s);
    if (d.accion !== 'acreditar') continue;
    const pi = typeof s.payment_intent === 'object' ? s.payment_intent : null;
    const cargo = pi && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    if (cargo && ((cargo.amount_refunded ?? 0) > 0 || cargo.disputed)) { r.sinTocar.push(s.id); continue; }
    if ((await acreditarPack(admin, d, new Date(s.created * 1000))) === 'creado') r.acreditados.push(s.id);
  }
  return r;
}
