import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { sellarFacturaDeRecibo } from '@/lib/billing/sellar-factura-server';

// ─────────────────────────────────────────────────────────────────────────────
// Sella una factura con su huella Veri*Factu y la persiste. El núcleo vive en
// lib/billing/sellar-factura-server (reutilizado por el webhook de Stripe para
// facturar por ciclo tras un cobro SEPA). Aquí solo va la capa HTTP + seguridad.
//
// SEGURIDAD: solo staff autenticado, y solo puede facturar en SU estudio. Todo
// el contenido fiscal (importes, número, receptor) se recalcula en servidor
// desde el recibo; los campos del body se IGNORAN salvo id/studioId/reciboId.
//
// ⚠️ La huella y el QR se generan según el orden oficial de la AEAT, pero deben
// validarse contra el entorno de PRUEBAS de la AEAT y con un asesor antes de
// producción (VERIFACTU_ENTORNO=produccion para el endpoint real).
// ─────────────────────────────────────────────────────────────────────────────

interface FacturaEntrante {
  id: string;
  studioId: string;
  reciboId: string;
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Servidor sin service-role configurada' }, { status: 503 });
  }

  const f = (await req.json()) as FacturaEntrante;
  if (!f?.id || !f?.reciboId) {
    return NextResponse.json({ error: 'Factura incompleta' }, { status: 400 });
  }
  if (f.studioId !== sesion.studioId) {
    return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  }

  const r = await sellarFacturaDeRecibo(admin, { studioId: f.studioId, reciboId: f.reciboId, facturaId: f.id });
  if (!r.ok) {
    const status = r.error === 'Recibo no encontrado' ? 404 : 500;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json(r);
}
