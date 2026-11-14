import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { articuloDe, categoriaDe } from '@/lib/ayuda/registro';

export const runtime = 'nodejs';

// Lectura interna de ayuda_feedback (permiso content.write, mismo equipo que
// edita /ayuda y el changelog) — la tabla no tiene ninguna política RLS que
// permita leerla desde el cliente, así que esta ruta con service role es el
// único camino.
const LIMITE_FILAS = 2000;

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await db
    .from('ayuda_feedback')
    .select('id, articulo_slug, categoria_slug, valoracion, url, creado_en')
    .order('creado_en', { ascending: false })
    .limit(LIMITE_FILAS);
  if (error) return NextResponse.json({ error: 'No se ha podido cargar el feedback.' }, { status: 500 });

  const filas = data ?? [];

  const porArticulo = new Map<string, { articulo: string; categoria: string; titulo: string; malo: number; regular: number; bueno: number; desactualizada: number }>();
  for (const f of filas) {
    const clave = `${f.categoria_slug}/${f.articulo_slug}`;
    if (!porArticulo.has(clave)) {
      const ficha = articuloDe(f.categoria_slug, f.articulo_slug);
      porArticulo.set(clave, {
        articulo: f.articulo_slug, categoria: f.categoria_slug,
        titulo: ficha?.titulo ?? `${categoriaDe(f.categoria_slug)?.titulo ?? f.categoria_slug} / ${f.articulo_slug}`,
        malo: 0, regular: 0, bueno: 0, desactualizada: 0,
      });
    }
    const fila = porArticulo.get(clave)!;
    if (f.valoracion === 'MALO') fila.malo++;
    else if (f.valoracion === 'REGULAR') fila.regular++;
    else if (f.valoracion === 'DESACTUALIZADA') fila.desactualizada++;
    else fila.bueno++;
  }

  // `total` son las valoraciones de calidad (😞😐😃); «desactualizada» es un aviso aparte y no entra en los porcentajes.
  const articulos = [...porArticulo.values()].map((a) => ({ ...a, total: a.malo + a.regular + a.bueno }));

  const valoraciones = filas.filter((f) => f.valoracion !== 'DESACTUALIZADA');
  const total = valoraciones.length;
  const malo = valoraciones.filter((f) => f.valoracion === 'MALO').length;
  const regular = valoraciones.filter((f) => f.valoracion === 'REGULAR').length;
  const bueno = valoraciones.filter((f) => f.valoracion === 'BUENO').length;

  return NextResponse.json({
    resumen: {
      total,
      pctMalo: total > 0 ? Math.round((malo / total) * 1000) / 10 : 0,
      pctRegular: total > 0 ? Math.round((regular / total) * 1000) / 10 : 0,
      pctBueno: total > 0 ? Math.round((bueno / total) * 1000) / 10 : 0,
      desactualizadas: filas.length - total,
    },
    articulos: articulos.sort((a, b) => b.total - a.total),
    recientes: filas.slice(0, 200),
  });
}
