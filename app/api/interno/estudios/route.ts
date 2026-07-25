import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Lista de estudios con lo justo para decidir en cuál entrar: quién es, qué
// plan tiene, cuánto lo usa y cuándo se le vio por última vez.
//
// Cruza inquilinos con service-role, y eso SOLO es legítimo porque exigirPermiso
// ya ha comprobado que quien pregunta es del equipo interno. Las políticas RLS
// de `studios` siguen intactas para el resto de la aplicación.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const busqueda = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();

  const [studios, socios, sesiones, staff] = await Promise.all([
    db.from('studios').select('id, slug, nombre, plan, email, telefono, creado_en, stripe_customer_id'),
    db.from('socios').select('studio_id'),
    db.from('sesiones').select('studio_id, inicio'),
    db.from('instructores').select('studio_id, auth_user_id, activo'),
  ]);

  const cuenta = (filas: Array<Record<string, unknown>> | null, clave = 'studio_id') => {
    const m = new Map<string, number>();
    for (const f of filas ?? []) {
      const k = f[clave] as string;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const nSocios = cuenta(socios.data);
  const nStaff = cuenta((staff.data ?? []).filter(i => i.activo));

  // Última clase programada: el mejor indicador local de "esto sigue vivo".
  // El último login de verdad está en auth.users y se resuelve en la ficha.
  const ultimaClase = new Map<string, string>();
  const clasesPorEstudio = new Map<string, number>();
  for (const s of sesiones.data ?? []) {
    const k = s.studio_id as string;
    clasesPorEstudio.set(k, (clasesPorEstudio.get(k) ?? 0) + 1);
    const ini = String(s.inicio ?? '');
    if (ini && ini > (ultimaClase.get(k) ?? '')) ultimaClase.set(k, ini);
  }

  let lista = (studios.data ?? []).map(s => {
    const id = s.id as string;
    const socias = nSocios.get(id) ?? 0;
    const clases = clasesPorEstudio.get(id) ?? 0;
    return {
      id,
      slug: s.slug as string,
      nombre: (s.nombre as string | null) ?? (s.slug as string),
      plan: s.plan as string,
      email: (s.email as string | null) ?? null,
      telefono: (s.telefono as string | null) ?? null,
      creadoEn: s.creado_en as string,
      tieneClienteStripe: Boolean(s.stripe_customer_id),
      socias,
      clases,
      equipo: nStaff.get(id) ?? 0,
      ultimaClase: ultimaClase.get(id) ?? null,
      // Distinguir "alta que nunca se usó" de "cliente real" es la primera
      // pregunta que uno se hace mirando esta lista.
      vacio: socias === 0 && clases === 0,
    };
  });

  if (busqueda) {
    lista = lista.filter(s =>
      s.nombre.toLowerCase().includes(busqueda) ||
      s.slug.toLowerCase().includes(busqueda) ||
      (s.email ?? '').toLowerCase().includes(busqueda));
  }

  // Los que más se usan primero; los vacíos al fondo.
  lista.sort((a, b) => Number(a.vacio) - Number(b.vacio) || b.socias - a.socias || b.clases - a.clases);

  return NextResponse.json({ estudios: lista });
}
