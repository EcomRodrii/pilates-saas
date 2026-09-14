import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { crearBaja } from '@/lib/sustituciones/baja';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';
import { normalizarCategoria } from '@/lib/student/baja-instructora';

// «No puedo dar esta clase» desde la app del estudio.
//
// NO cancela la clase (decisión del 14-sep-2026): pide la baja y la deja en
// manos del motor de sustituciones de siempre (`crearBaja`, el mismo núcleo que
// usan el panel y el enlace firmado). Idempotencia, ranking, modo de autonomía
// del estudio y escalado son idénticos vengan de donde vengan.
//
// La instructora y el estudio salen del token + slug; del body solo la clase y
// el motivo. `soloSiInstructorEs` hace que una clase ajena responda igual que
// una que no existe (404), sin decir cuál es cuál.
//
// A ella no se le devuelve la sustitución: lleva el ranking con nombres de
// compañeras. Mismo recorte que `app/api/sustituciones` y `app/api/public/baja`.
//
// El motivo va en tres opciones fijas (`categoria`) más la nota libre, las dos
// opcionales; `crearBaja` las guarda aparte, donde recepción no llega.
const LIMITE = { max: 10, windowSeconds: 60 };

export async function POST(req: NextRequest) {
  // Uno amplio por IP ANTES de verificar el token: sin él, una petición sin
  // sesión llegaría gratis a la verificación y a la BD. El que cuenta de verdad
  // es el de por instructora, más abajo.
  const porIp = await enforceRateLimit(req, 'portal-instructora-baja-ip', { max: 30, windowSeconds: 60 });
  if (porIp) return porIp;

  const body = await req.json().catch(() => null) as { slug?: string; sesionId?: unknown; motivo?: unknown; categoria?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const sesionId = typeof body.sesionId === 'string' ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Por instructora y no por IP: con datos y wifi a la vez, la IP cambia.
    const limite = await rateLimit(`portal-instructora-baja:${sesion.instructorId}`, LIMITE);
    if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, LIMITE.windowSeconds));

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    const r = await crearBaja(admin, {
      studioId: sesion.studioId,
      sesionId,
      motivo: typeof body.motivo === 'string' ? body.motivo : null,
      categoria: normalizarCategoria(body.categoria),
      origen: 'instructora',
      soloSiInstructorEs: sesion.instructorId,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, yaAvisada: r.yaExistia });
  } catch (err) {
    return errorInterno('portal/instructora/baja:POST', err,
      'No hemos podido avisar al estudio. Tu clase sigue a tu nombre: inténtalo de nuevo.');
  }
}
