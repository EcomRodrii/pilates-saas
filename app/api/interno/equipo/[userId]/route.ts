import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirAlguno } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { esPermiso, tienePermiso, type Permiso } from '@/lib/interno/permisos';
import { puedeGuardarCambio } from '@/lib/interno/equipo-reglas';
import { leerEquipo } from '@/lib/interno/equipo-server';

export const runtime = 'nodejs';

interface CuerpoCambio {
  activo?: boolean;
  permisos?: string[];
  cargo?: string | null;
}

// Cambiar el acceso de alguien del equipo: permisos, cargo, o darle de baja.
//
// El permiso que hace falta depende de lo que cambies, no de la ruta: dar de
// baja es `users.delete` y todo lo demás `users.create`. Si fuera un solo
// permiso para las dos cosas, "puede incorporar gente" implicaría "puede echar
// a cualquiera", que no es lo mismo ni de lejos.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const g = await exigirAlguno(req, ['users.create', 'users.delete']);
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { userId } = await params;
  const cuerpo = (await req.json().catch(() => null)) as CuerpoCambio | null;
  if (!cuerpo) return NextResponse.json({ error: 'Falta el cambio' }, { status: 400 });

  const equipo = await leerEquipo(db);
  const antes = equipo.find(m => m.userId === userId);
  if (!antes) return NextResponse.json({ error: 'Esa persona no está en el equipo.' }, { status: 404 });

  const activo = cuerpo.activo ?? antes.activo;
  const cargo = cuerpo.cargo === undefined ? antes.cargo : (cuerpo.cargo?.trim() || null);

  const brutos = cuerpo.permisos ?? antes.permisos;
  const desconocido = brutos.find(p => !esPermiso(p));
  if (desconocido) return NextResponse.json({ error: `"${desconocido}" no es un permiso.` }, { status: 400 });
  const permisos = brutos as Permiso[];

  const daDeBaja = antes.activo && !activo;
  const requerido: Permiso = daDeBaja ? 'users.delete' : 'users.create';
  if (!tienePermiso(g.admin.permisos, requerido)) {
    return NextResponse.json({ error: `Te falta el permiso "${requerido}" para hacer esto.` }, { status: 403 });
  }

  if (activo && permisos.length === 0) {
    return NextResponse.json(
      { error: 'Déjale al menos un permiso, o dale de baja. Sin permisos entra y no ve nada.' },
      { status: 400 },
    );
  }

  const veredicto = puedeGuardarCambio(g.admin, equipo, userId, { activo, permisos });
  if (!veredicto.ok) return NextResponse.json({ error: veredicto.motivo }, { status: 403 });

  if (activo !== antes.activo || cargo !== antes.cargo) {
    const { error } = await db.from('plataforma_admin')
      .update({ activo, cargo }).eq('auth_user_id', userId);
    if (error) return NextResponse.json({ error: 'No se ha podido guardar.' }, { status: 500 });
  }

  const quitar = antes.permisos.filter(p => !permisos.includes(p as Permiso));
  const añadir = permisos.filter(p => !antes.permisos.includes(p));

  // Primero quitar y luego añadir: al revés, un fallo a mitad deja a alguien
  // con MÁS acceso del que tenía. Si algo va a quedar a medias, que quede del
  // lado de menos permisos.
  if (quitar.length > 0) {
    const { error } = await db.from('plataforma_permiso')
      .delete().eq('auth_user_id', userId).in('permiso', quitar);
    if (error) return NextResponse.json({ error: 'No se han podido quitar los permisos.' }, { status: 500 });
  }
  if (añadir.length > 0) {
    const { error } = await db.from('plataforma_permiso')
      .insert(añadir.map(p => ({ auth_user_id: userId, permiso: p, concedido_por: g.admin.userId })));
    if (error) return NextResponse.json({ error: 'No se han podido conceder los permisos.' }, { status: 500 });
  }

  // Un resumen que se entienda seis meses después sin abrir el JSON de al lado.
  const trozos: string[] = [];
  if (activo !== antes.activo) trozos.push(activo ? 'reactivada' : 'dada de baja');
  if (cargo !== antes.cargo) trozos.push(`cargo → ${cargo ?? 'sin cargo'}`);
  if (añadir.length) trozos.push(`+${añadir.join(' +')}`);
  if (quitar.length) trozos.push(`−${quitar.join(' −')}`);

  if (trozos.length > 0) {
    await registrar(db, req, {
      actor: g.admin,
      accion: daDeBaja ? 'equipo.baja' : 'equipo.cambiado',
      objetivoTipo: 'plataforma_admin', objetivoId: userId,
      resumen: `${antes.nombre}: ${trozos.join(' · ')}`,
      antes: { activo: antes.activo, cargo: antes.cargo, permisos: antes.permisos },
      despues: { activo, cargo, permisos },
    });
  }

  return NextResponse.json({ ok: true, sinCambios: trozos.length === 0 });
}
