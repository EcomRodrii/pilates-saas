import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { validarLead, type Lead } from '@/lib/interno/crecimiento';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Crecimiento: de dónde vienen los clientes y qué piden.
//
// Junta tres cosas que hasta ahora se escribían y **no las leía nadie**:
//
//   1. Los leads del concierge de la landing. Antes de la migración 0136 ni
//      siquiera se guardaban: iban a un correo y punto.
//   2. `studios.como_nos_conocio` — se rellena en el alta desde la migración
//      0123 y no aparecía en ninguna pantalla.
//   3. `soporte_solicitudes` — las dudas y peticiones de mejora que mandan los
//      estudios. Se escriben desde el widget de ayuda y desde el botón de
//      "avísame cuando esté la integración X", y no había ninguna UI que las
//      mostrase, ni aquí ni en el panel de un estudio.
//
// Primer consumidor real del permiso `crm.update`, que llevaba declarado desde
// que se montó el panel sin cerrar ninguna puerta.
// ─────────────────────────────────────────────────────────────────────────────

function aLead(f: Record<string, unknown>): Lead {
  return {
    id: f.id as string,
    email: f.email as string,
    nombre: (f.nombre as string | null) ?? null,
    estudio: (f.estudio as string | null) ?? null,
    telefono: (f.telefono as string | null) ?? null,
    ciudad: (f.ciudad as string | null) ?? null,
    softwareActual: (f.software_actual as string | null) ?? null,
    mensaje: (f.mensaje as string | null) ?? null,
    origen: (f.origen as string) ?? 'MANUAL',
    estado: (f.estado as string) ?? 'NUEVO',
    motivoPerdida: (f.motivo_perdida as string | null) ?? null,
    proximoPaso: (f.proximo_paso as string | null) ?? null,
    proximaFecha: (f.proxima_fecha as string | null) ?? null,
    studioId: (f.studio_id as string | null) ?? null,
    notas: (f.notas as string | null) ?? null,
    creadoEn: String(f.creado_en ?? ''),
    actualizadoEn: String(f.actualizado_en ?? f.creado_en ?? ''),
  };
}

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'crm.update');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [leads, estudios, peticiones] = await Promise.all([
    db.from('plataforma_lead').select('*').order('creado_en', { ascending: false }),
    // Las cuatro `onb_*` son las respuestas del asistente de bienvenida, que
    // se llevaban escribiendo sin que ninguna pantalla las leyera. Ver
    // `perfilDeLosEstudios` en lib/interno/crecimiento.ts.
    db.from('studios').select(
      'id, nombre, como_nos_conocio, creado_en, onb_centros, onb_software_anterior, onb_alumnos_activos, onb_importar_datos',
    ),
    // `soporte_solicitudes` tiene RLS por tenant: desde aquí solo se lee con
    // service-role, y solo después de haber validado `crm.update` arriba.
    db.from('soporte_solicitudes')
      .select('id, tipo, mensaje, contacto, studio_id, creado_en')
      .order('creado_en', { ascending: false })
      .limit(500),
  ]);
  if (leads.error) return NextResponse.json({ error: leads.error.message }, { status: 500 });

  const nombrePorEstudio = new Map<string, string>();
  for (const e of estudios.data ?? []) {
    nombrePorEstudio.set(e.id as string, (e.nombre as string | null) ?? (e.id as string));
  }

  return NextResponse.json({
    leads: (leads.data ?? []).map(aLead),
    estudios: (estudios.data ?? []).map(e => ({
      id: e.id as string,
      nombre: (e.nombre as string | null) ?? (e.id as string),
      comoNosConocio: (e.como_nos_conocio as string | null) ?? null,
      creadoEn: String(e.creado_en ?? ''),
      onbCentros: (e.onb_centros as string | null) ?? null,
      onbSoftwareAnterior: (e.onb_software_anterior as string | null) ?? null,
      onbAlumnosActivos: (e.onb_alumnos_activos as string | null) ?? null,
      onbImportarDatos: (e.onb_importar_datos as string | null) ?? null,
    })),
    peticiones: (peticiones.data ?? []).map(p => ({
      id: p.id as string,
      tipo: (p.tipo as string) ?? 'DUDA',
      mensaje: (p.mensaje as string) ?? '',
      contacto: (p.contacto as string | null) ?? null,
      estudio: nombrePorEstudio.get(p.studio_id as string) ?? null,
      creadoEn: String(p.creado_en ?? ''),
    })),
  });
}

const CAMPOS_TEXTO = [
  'nombre', 'estudio', 'telefono', 'ciudad', 'mensaje', 'notas',
  'proximo_paso', 'motivo_perdida', 'software_actual',
] as const;

interface CuerpoLead extends Partial<Record<(typeof CAMPOS_TEXTO)[number], string | null>> {
  id?: string;
  email?: string;
  estado?: string;
  origen?: string;
  proxima_fecha?: string | null;
  studio_id?: string | null;
}

// Crea o actualiza un lead. Un solo verbo para las dos cosas porque la pantalla
// también lo trata como una sola: escribes en la ficha y guardas.
export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'crm.update');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as CuerpoLead | null;
  if (!cuerpo) return NextResponse.json({ error: 'Falta el lead' }, { status: 400 });

  const antes = cuerpo.id
    ? (await db.from('plataforma_lead').select('*').eq('id', cuerpo.id).maybeSingle()).data
    : null;
  if (cuerpo.id && !antes) return NextResponse.json({ error: 'Ese lead no existe.' }, { status: 404 });

  const email = (cuerpo.email ?? (antes?.email as string) ?? '').trim().toLowerCase();
  const estado = cuerpo.estado ?? (antes?.estado as string) ?? 'NUEVO';
  const motivoPerdida = cuerpo.motivo_perdida !== undefined
    ? cuerpo.motivo_perdida
    : (antes?.motivo_perdida as string | null) ?? null;

  const veredicto = validarLead({ email, estado, motivoPerdida });
  if (!veredicto.ok) return NextResponse.json({ error: veredicto.motivo }, { status: 400 });

  const fila: Record<string, unknown> = {
    email, estado,
    origen: cuerpo.origen ?? (antes?.origen as string) ?? 'MANUAL',
    proxima_fecha: cuerpo.proxima_fecha !== undefined
      ? (cuerpo.proxima_fecha || null) : (antes?.proxima_fecha ?? null),
    studio_id: cuerpo.studio_id !== undefined
      ? (cuerpo.studio_id || null) : (antes?.studio_id ?? null),
    actualizado_en: new Date().toISOString(),
  };
  for (const c of CAMPOS_TEXTO) {
    if (cuerpo[c] !== undefined) fila[c] = (cuerpo[c] ?? '').toString().trim() || null;
    else if (antes) fila[c] = antes[c] ?? null;
  }
  // El motivo solo tiene sentido mientras esté perdido. Si alguien lo recupera,
  // se limpia: dejarlo colgado haría que el recuento de motivos contase bajas
  // que ya no lo son.
  if (estado !== 'PERDIDO') fila.motivo_perdida = null;

  const id = cuerpo.id ?? `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const { error } = antes
    ? await db.from('plataforma_lead').update(fila).eq('id', id)
    : await db.from('plataforma_lead').insert({ ...fila, id });
  if (error) {
    // 23505 = ya hay un lead con ese email. Es el índice único, y decirlo así
    // ahorra crear un duplicado a mano y descubrirlo tres semanas después.
    if (error.code === '23505') {
      return NextResponse.json({ error: `Ya hay un lead con el email ${email}.` }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se ha podido guardar el lead.' }, { status: 500 });
  }

  const nombre = (fila.nombre as string | null) ?? email;
  await registrar(db, req, {
    actor: g.admin,
    accion: antes ? 'lead.cambiado' : 'lead.creado',
    objetivoTipo: 'plataforma_lead', objetivoId: id,
    resumen: antes && antes.estado !== estado
      ? `${nombre}: ${antes.estado} → ${estado}${estado === 'PERDIDO' ? ` (${motivoPerdida})` : ''}`
      : `${nombre}: ${antes ? 'ficha actualizada' : `alta como ${estado}`}`,
    antes: antes ? { estado: antes.estado, proximo_paso: antes.proximo_paso } : null,
    despues: { estado, proximo_paso: fila.proximo_paso },
  });

  return NextResponse.json({ ok: true, id });
}
