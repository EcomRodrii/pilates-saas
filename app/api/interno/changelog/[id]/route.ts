import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';

export const runtime = 'nodejs';

const ETIQUETAS = ['NUEVA_FUNCIONALIDAD', 'MEJORA', 'RENDIMIENTO', 'ARREGLO'] as const;
const VERSION_RE = /^\d+\.\d+(\.\d+)?$/;

interface CuerpoCambio {
  texto?: string;
  etiqueta?: string;
}

interface CuerpoPatch {
  version?: string;
  titulo?: string;
  fechaPublicacion?: string;
  // Array COMPLETO de cambios de la versión — se reemplaza entero (borra +
  // inserta), no hay edición granular de un cambio suelto: no hay caso real
  // de tocar un cambio sin tener ya abierta toda la versión en el formulario.
  cambios?: CuerpoCambio[];
  publicar?: boolean;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { id } = await params;
  const cuerpo = (await req.json().catch(() => null)) as CuerpoPatch | null;
  if (!cuerpo) return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });

  const { data: actual, error: errLeer } = await db.from('changelog_versiones')
    .select('id, version, titulo, fecha_publicacion, estado').eq('id', id).maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se ha podido leer la versión.' }, { status: 500 });
  if (!actual) return NextResponse.json({ error: 'Esa versión no existe.' }, { status: 404 });

  // Publicar es su propia rama: nunca se cuela dentro de una edición de
  // contenido (evita publicar sin querer al guardar un cambio de texto).
  if (cuerpo.publicar) {
    if (actual.estado === 'publicado') return NextResponse.json({ ok: true, yaEstaba: true });
    const { error } = await db.from('changelog_versiones')
      .update({ estado: 'publicado', publicado_en: new Date().toISOString() }).eq('id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido publicar.' }, { status: 500 });

    await registrar(db, req, {
      actor: g.admin,
      accion: 'changelog.version.publicada',
      objetivoTipo: 'changelog_version', objetivoId: id,
      resumen: `Versión ${actual.version} publicada`,
      antes: { estado: actual.estado }, despues: { estado: 'publicado' },
    });
    return NextResponse.json({ ok: true });
  }

  // Validar TODO antes de escribir NADA — antes esto escribía version/titulo/
  // fecha_publicacion primero y solo después validaba `cambios`; un cambio con
  // texto vacío o etiqueta desconocida devolvía 400 con el título YA guardado
  // en BD, mientras el formulario (que seguía en modo edición) hacía parecer
  // que no se había guardado nada.
  const update: Record<string, unknown> = {};
  if (cuerpo.version !== undefined) {
    if (!VERSION_RE.test(cuerpo.version.trim())) return NextResponse.json({ error: 'La versión tiene que tener forma "0.92" o "1.0.3".' }, { status: 400 });
    update.version = cuerpo.version.trim();
  }
  if (cuerpo.titulo !== undefined) {
    if (cuerpo.titulo.trim().length < 3) return NextResponse.json({ error: 'Ponle un título a la versión.' }, { status: 400 });
    update.titulo = cuerpo.titulo.trim();
  }
  if (cuerpo.fechaPublicacion !== undefined) update.fecha_publicacion = cuerpo.fechaPublicacion;

  let filas: Array<{ texto: string; etiqueta: string; orden: number }> | null = null;
  if (cuerpo.cambios !== undefined) {
    filas = cuerpo.cambios.map((c, i) => ({ texto: (c.texto ?? '').trim(), etiqueta: c.etiqueta ?? '', orden: i }));
    if (filas.some(c => c.texto.length === 0)) return NextResponse.json({ error: 'Ningún cambio puede quedar vacío.' }, { status: 400 });
    const desconocida = filas.find(c => !ETIQUETAS.includes(c.etiqueta as typeof ETIQUETAS[number]));
    if (desconocida) return NextResponse.json({ error: `"${desconocida.etiqueta}" no es una etiqueta válida.` }, { status: 400 });
  }

  if (Object.keys(update).length > 0) {
    const { error } = await db.from('changelog_versiones').update(update).eq('id', id);
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: `Ya existe una versión "${update.version}".` }, { status: 409 });
      return NextResponse.json({ error: 'No se ha podido guardar.' }, { status: 500 });
    }
  }

  if (filas) {
    // INSERT antes que DELETE: si el insert falla a medias, la versión se
    // queda con los cambios VIEJOS en vez de sin ninguno — un reintento no
    // pierde nada. Al revés (borrar primero) hay una ventana donde un fallo
    // de red deja la versión sin cambios de verdad, no solo "sin guardar".
    let nuevosIds: string[] = [];
    if (filas.length > 0) {
      const { data: insertados, error: errInsertar } = await db.from('changelog_cambios')
        .insert(filas.map(f => ({ version_id: id, etiqueta: f.etiqueta, texto: f.texto, orden: f.orden })))
        .select('id');
      if (errInsertar) return NextResponse.json({ error: 'No se han podido guardar los cambios.' }, { status: 500 });
      nuevosIds = (insertados ?? []).map(r => r.id as string);
    }
    const borrarViejos = db.from('changelog_cambios').delete().eq('version_id', id);
    const { error: errBorrar } = nuevosIds.length > 0
      ? await borrarViejos.not('id', 'in', `(${nuevosIds.join(',')})`)
      : await borrarViejos;
    if (errBorrar) return NextResponse.json({ error: 'No se han podido limpiar los cambios anteriores.' }, { status: 500 });
  }

  await registrar(db, req, {
    actor: g.admin,
    accion: 'changelog.version.editada',
    objetivoTipo: 'changelog_version', objetivoId: id,
    resumen: `Versión ${actual.version} editada`,
    antes: actual, despues: { ...update, cambios: filas },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { id } = await params;
  const { data: actual, error: errLeer } = await db.from('changelog_versiones').select('version, estado').eq('id', id).maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se ha podido comprobar la versión.' }, { status: 500 });
  if (!actual) return NextResponse.json({ ok: true, yaEstaba: true });

  const { error } = await db.from('changelog_versiones').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'No se ha podido borrar.' }, { status: 500 });

  await registrar(db, req, {
    actor: g.admin,
    accion: 'changelog.version.borrada',
    objetivoTipo: 'changelog_version', objetivoId: id,
    resumen: `Versión ${actual.version} borrada (estaba ${actual.estado})`,
    antes: actual, despues: null,
  });

  return NextResponse.json({ ok: true });
}
