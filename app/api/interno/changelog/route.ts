import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { compararVersiones } from '@/lib/utils';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Changelog de "Actualizaciones" — antes lib/novedades.ts, texto hardcodeado
// que exigía deploy para cambiar. Aquí se lista TODO (incl. borradores, para
// poder editar antes de publicar); el widget del panel de un estudio lee
// directo de Supabase con RLS (solo estado='publicado'), no por esta ruta.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await db
    .from('changelog_versiones')
    .select('id, version, titulo, fecha_publicacion, estado, publicado_en, changelog_cambios(id, etiqueta, texto, orden)')
    .order('fecha_publicacion', { ascending: false });
  if (error) return NextResponse.json({ error: 'No se ha podido cargar el changelog.' }, { status: 500 });

  // `version` es texto ("0.92", "1.0.3"): un ORDER BY de SQL la ordena como
  // texto, no numéricamente ("0.10" saldría antes que "0.2"). Se reordena en
  // JS con compararVersiones como desempate dentro de la misma fecha.
  const ordenado = [...(data ?? [])].sort((a, b) =>
    a.fecha_publicacion === b.fecha_publicacion
      ? compararVersiones(b.version, a.version)
      : b.fecha_publicacion.localeCompare(a.fecha_publicacion));

  return NextResponse.json({ versiones: ordenado });
}

interface CuerpoCrear {
  version?: string;
  titulo?: string;
  fechaPublicacion?: string;
}

const VERSION_RE = /^\d+\.\d+(\.\d+)?$/;

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as CuerpoCrear | null;
  const version = (cuerpo?.version ?? '').trim();
  const titulo = (cuerpo?.titulo ?? '').trim();
  const fechaPublicacion = (cuerpo?.fechaPublicacion ?? '').trim();

  if (!VERSION_RE.test(version)) return NextResponse.json({ error: 'La versión tiene que tener forma "0.92" o "1.0.3".' }, { status: 400 });
  if (titulo.length < 3) return NextResponse.json({ error: 'Ponle un título a la versión.' }, { status: 400 });
  if (!fechaPublicacion) return NextResponse.json({ error: 'Falta la fecha de publicación.' }, { status: 400 });

  const { data, error } = await db.from('changelog_versiones')
    .insert({ version, titulo, fecha_publicacion: fechaPublicacion, creado_por: g.admin.userId })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `Ya existe una versión "${version}".` }, { status: 409 });
    return NextResponse.json({ error: 'No se ha podido crear la versión.' }, { status: 500 });
  }

  await registrar(db, req, {
    actor: g.admin,
    accion: 'changelog.version.creada',
    objetivoTipo: 'changelog_version', objetivoId: data.id as string,
    resumen: `Versión ${version} creada como borrador`,
    antes: null, despues: { version, titulo, fechaPublicacion },
  });

  return NextResponse.json({ ok: true, id: data.id });
}
