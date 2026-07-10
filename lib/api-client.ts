'use client';

import { supabase } from '@/lib/supabase';
import { supabasePortal } from '@/lib/supabase-portal';
import type { Factura } from '@/lib/types';

// Cabecera Authorization con el JWT de la sesión de staff (Supabase Auth). Las
// rutas de servidor de staff la validan con verificarSesionStaff. Devuelve {}
// si no hay sesión (la ruta responderá 401).
export async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// Cabecera Authorization con el JWT de la SOCIA (portal, magic link). La validan
// verificarUsuarioSupabase + socioAutenticado en los endpoints públicos que ya
// exigen sesión real. Devuelve {} si no hay sesión de socia.
export async function portalAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabasePortal.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// ── Datos públicos (proxy scopeado) ─────────────────────────────────────────
// Carga el catálogo del estudio + (si hay socia en sesión) sus datos, vía el
// endpoint de servidor con service-role. Sustituye el acceso anónimo directo.
export async function cargarDatosPublicos(slug: string) {
  // La identidad de la socia va en el JWT (Bearer), no en el body: el servidor
  // deriva sus datos del token. Sin sesión → solo catálogo público.
  const res = await fetch('/api/public/studio-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) return null;
  return res.json();
}

// Lee la identidad de la socia guardada en el navegador (portal o reserva).
export function leerSociaLocal(): { socioId: string; email: string } | null {
  if (typeof window === 'undefined') return null;
  for (const key of ['ps_portal_session', 'ps_portal_socia']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const s = JSON.parse(raw) as { socioId?: string; email?: string };
      if (s?.socioId && s?.email) return { socioId: s.socioId, email: s.email };
    } catch { /* ignore */ }
  }
  return null;
}

// ── Stripe ────────────────────────────────────────────────────────────────────

export async function crearCheckoutStripe(params: {
  reciboId: string;
  socioId: string;
  studioId: string;
  concepto: string;
  importe: number;
  socioEmail: string | null;
  socioNombre: string;
}): Promise<{ url: string } | { error: string }> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<{ url: string } | { error: string }>;
}

// Aprobación de un toque: cobra un recibo pendiente con la tarjeta ya
// guardada de la socia, sin redirigirla a ningún sitio.
export async function aprobarCobroAutonomo(params: {
  logId: string;
  reciboId: string;
  socioId: string;
  studioId: string;
}): Promise<{ ok: true } | { error: string }> {
  const res = await fetch('/api/stripe/charge-off-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
  return { ok: true };
}

// ── Facturas (Veri*Factu) ──────────────────────────────────────────────────────
// Sella y persiste una factura en el servidor: calcula la huella encadenada por
// estudio (SHA-256, node:crypto) y la guarda. Devuelve los campos sellados para
// refrescar el estado local. Si falla, la factura queda en memoria sin huella.
export interface FacturaSellada {
  verifactuHash: string | null;
  verifactuPrevHash: string | null;
  verifactuTs: string | null;
  verifactuSeq: number | null;
  qrUrl?: string;
  entorno?: 'produccion' | 'pruebas';
}

export async function sellarFactura(fac: Factura): Promise<{ ok: boolean; sellada?: boolean; aviso?: string | null; factura?: FacturaSellada }> {
  try {
    const res = await fetch('/api/facturas/sellar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        id: fac.id,
        studioId: fac.studioId,
        reciboId: fac.reciboId,
        numeroCompleto: fac.numeroCompleto,
        fechaEmision: fac.fechaEmision,
        receptorNombre: fac.receptorNombre,
        receptorNIF: fac.receptorNIF,
        baseImponible: fac.baseImponible,
        tipoIVA: fac.tipoIVA,
        cuotaIVA: fac.cuotaIVA,
        total: fac.total,
      }),
    });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

// ── Emails ────────────────────────────────────────────────────────────────────

export async function enviarEmailRecibo(params: {
  to: string;
  toName: string;
  concepto: string;
  importe: number;
  fechaCobro: string;
  numeroFactura?: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'recibo',
      to: params.to,
      toName: params.toName,
      data: {
        concepto: params.concepto,
        importe: params.importe,
        fechaCobro: params.fechaCobro,
        numeroFactura: params.numeroFactura,
      },
    }),
  });
}

export async function enviarEmailBienvenida(params: {
  to: string;
  toName: string;
  planNombre?: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'bienvenida',
      to: params.to,
      toName: params.toName,
      data: { planNombre: params.planNombre },
    }),
  });
}

// Envía un email de campaña de marketing a una destinataria. Reutiliza la
// plantilla 'automatizacion' (asunto → titulo, contenido → mensaje).
export async function enviarEmailCampana(params: {
  to: string;
  toName: string;
  asunto: string;
  contenido: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/emails/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        tipo: 'automatizacion',
        to: params.to,
        toName: params.toName,
        data: { titulo: params.asunto, mensaje: params.contenido },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function enviarEmailReserva(params: {
  to: string;
  toName: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'reserva',
      to: params.to,
      toName: params.toName,
      data: {
        claseNombre: params.claseNombre,
        fecha: params.fecha,
        hora: params.hora,
        sala: params.sala,
        instructor: params.instructor,
      },
    }),
  });
}

// Datos de clase compartidos por los emails transaccionales de calendario.
export interface DatosClaseEmailCliente {
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
}

// Aviso a una socia ascendida de la lista de espera (disparo desde el panel al
// cancelar el admin una reserva y promocionarse la siguiente).
export async function enviarEmailPromocion(params: DatosClaseEmailCliente & {
  to: string; toName: string; bonoConsumido?: boolean;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'promocion',
      to: params.to,
      toName: params.toName,
      data: {
        claseNombre: params.claseNombre, fecha: params.fecha, hora: params.hora,
        sala: params.sala, instructor: params.instructor, bonoConsumido: params.bonoConsumido ?? false,
      },
    }),
  });
}

// Aviso a una socia de que su clase reservada ha sido cancelada por el estudio.
export async function enviarEmailCancelacionClase(params: DatosClaseEmailCliente & {
  to: string; toName: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'cancelacion',
      to: params.to,
      toName: params.toName,
      data: {
        claseNombre: params.claseNombre, fecha: params.fecha, hora: params.hora,
        sala: params.sala, instructor: params.instructor,
      },
    }),
  });
}
