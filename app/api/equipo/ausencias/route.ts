import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, puedeVerDetalleAusencias } from '@/lib/permisos-reglas';
import { ausenciaVisiblePara } from '@/lib/ausencias';
import { errorInterno } from '@/lib/errores-servidor';
import { borrarAusencia, crearAusencia, listarAusencias } from '@/lib/sustituciones/ausencias-servidor';

// Ausencias de instructoras (vacaciones / baja médica / otro), desde el panel.
// La lógica (bloqueos materializados, marcha atrás, clases afectadas, aviso) vive
// en `lib/sustituciones/ausencias-servidor.ts`, compartida con la app del
// estudio; aquí se decide quién es quién y qué puede tocar.
//
// Todo acotado al estudio de la sesión de staff: nunca se fía del cliente.
//
// La instructora ya no pasa por aquí (Tentare Core retirado, 14-sep-2026): sus
// ausencias las gestiona desde la app del estudio (`/api/portal/instructora/ausencias`,
// misma lógica de `ausencias-servidor.ts`). En el panel, solo quien gestiona el equipo.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });

  if (staff.rol === 'INSTRUCTOR') return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const instructorId = req.nextUrl.searchParams.get('instructorId');

  try {
    const items = await listarAusencias(admin, {
      studioId: staff.studioId, alcance: instructorId ? { instructorId } : 'estudio',
    });

    // Tipo y motivo solo para quien gestiona el equipo. Recepción, que asigna clases
    // en el calendario, se lleva quién y qué días. Espejo de la RLS
    // `ausencias_gestion` (migr 20260914000209): esta ruta va con service-role y
    // la RLS no la ve, así que el recorte tiene que estar AQUÍ también.
    const verDetalle = puedeVerDetalleAusencias(staff.rol);
    return NextResponse.json({ items: items.map(a => ausenciaVisiblePara(a, verDetalle)) });
  } catch (err) {
    return errorInterno('equipo:ausencias:GET', err, 'No se han podido cargar las ausencias');
  }
}

export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!puedeGestionarEquipo(staff.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar ausencias del equipo' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const b = (await req.json().catch(() => null)) as
    | { instructorId?: string; tipo?: string; desde?: string; hasta?: string; motivo?: string }
    | null;

  const instructorId = b?.instructorId;

  const r = await crearAusencia(admin, {
    studioId: staff.studioId, instructorId, tipo: b?.tipo, desde: b?.desde, hasta: b?.hasta, motivo: b?.motivo,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id, clasesAfectadas: r.clasesAfectadas });
}

export async function DELETE(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!puedeGestionarEquipo(staff.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar ausencias del equipo' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const b = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  // Quien gestiona el equipo borra cualquiera del estudio.
  const r = await borrarAusencia(admin, { studioId: staff.studioId, id: b.id, alcance: 'estudio' });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
