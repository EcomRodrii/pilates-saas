import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { parseCsv } from '@/lib/csv';
import { autoMapearProspecto, validarFilasProspecto, aBorrador } from '@/lib/interno/prospeccion';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Prospección en frío — listado e importación.
//
// Primer consumidor real del permiso `marketing.send`, que llevaba declarado
// desde que se montó el panel sin cerrar ninguna puerta (mismo caso que tenía
// `crm.update` antes de que existiera /interno/crecimiento).
//
// El permiso es `marketing.send` y no `crm.update` a propósito: esto no es
// editar una ficha, es preparar correo que va a salir hacia terceros. La
// barrera tiene que estar en quien puede iniciar eso, no solo en quien toca el
// CRM.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'marketing.send');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Solo los leads de prospección: el resto del CRM ya tiene su pestaña, y
  // mezclarlos aquí convertiría la cola de revisión en la lista completa.
  const [leads, borradores] = await Promise.all([
    db.from('plataforma_lead').select('*')
      .eq('origen', 'IMPORT_PROSPECTOS').order('creado_en', { ascending: false }),
    db.from('plataforma_prospeccion_email').select('*')
      .order('generado_en', { ascending: false }),
  ]);
  if (leads.error) return NextResponse.json({ error: leads.error.message }, { status: 500 });

  return NextResponse.json({
    prospectos: (leads.data ?? []).map(f => ({
      id: f.id as string,
      email: f.email as string,
      estudio: (f.estudio as string | null) ?? null,
      ciudad: (f.ciudad as string | null) ?? null,
      web: (f.web as string | null) ?? null,
      instagram: (f.instagram as string | null) ?? null,
      softwareActual: (f.software_actual as string | null) ?? null,
      estado: (f.estado as string) ?? 'NUEVO',
      creadoEn: String(f.creado_en ?? ''),
    })),
    borradores: (borradores.data ?? []).map(aBorrador),
    // Que la pantalla pueda avisar ANTES de que alguien apruebe 12 correos y
    // descubra al pulsar "Enviar" que el buzón no está puesto.
    buzonConfigurado: Boolean(process.env.SPACEMAIL_USER && process.env.SPACEMAIL_PASSWORD),
  });
}

// Importa el CSV. Llega el texto crudo y se parsea AQUÍ, no en el navegador:
// una sola fuente de validación, y el servidor nunca confía en filas que ya
// vengan dadas por buenas desde el cliente.
export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'marketing.send');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as { csv?: string } | null;
  const texto = (cuerpo?.csv ?? '').trim();
  if (!texto) return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });

  const { headers, rows } = parseCsv(texto);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No hay ninguna fila de datos bajo la cabecera.' }, { status: 400 });
  }
  const mapa = autoMapearProspecto(headers);
  if (mapa.email < 0 || mapa.estudio < 0) {
    return NextResponse.json({
      error: 'Faltan columnas obligatorias. El CSV necesita al menos una de email y una de nombre de estudio.',
    }, { status: 400 });
  }

  const validadas = validarFilasProspecto(rows, mapa);
  const buenas = validadas.filter(v => v.estado === 'ok');
  const rechazadas = validadas.filter(v => v.estado === 'error');
  if (buenas.length === 0) {
    return NextResponse.json({
      error: 'Ninguna fila es válida.',
      rechazadas: rechazadas.map(r => ({ fila: r.fila, motivo: r.motivo })),
    }, { status: 400 });
  }

  // Qué emails ya existían, para poder contar altas y actualizaciones por
  // separado — y, sobre todo, para NO pisarles el estado del pipeline.
  const emails = buenas.map(b => b.datos.email);
  const { data: existentes } = await db
    .from('plataforma_lead').select('email').in('email', emails);
  const yaEstaban = new Set((existentes ?? []).map(e => e.email as string));

  const ahora = new Date().toISOString();
  const filas = buenas.map(({ datos }) => ({
    // El id solo se usa al INSERTAR: en un conflicto por email, Postgres
    // conserva la fila que ya había con su id original.
    id: `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    email: datos.email,
    estudio: datos.estudio,
    telefono: datos.telefono,
    ciudad: datos.ciudad,
    web: datos.web,
    instagram: datos.instagram,
    software_actual: datos.softwareActual,
    origen: 'IMPORT_PROSPECTOS',
    estado: 'NUEVO',
    actualizado_en: ahora,
  }));

  // ⚠️ `estado` y `origen` NO se listan en `onConflict`… porque supabase-js no
  // permite elegir columnas: un upsert pisa la fila entera. Así que se hace en
  // dos pasos — insertar solo los nuevos, y actualizar de los que ya existían
  // ÚNICAMENTE los campos informativos. Si alguien entró hace un mes por el
  // concierge y ya va por DEMO, reimportar el CSV no puede devolverlo a NUEVO
  // ni reetiquetarlo como lista fría.
  const nuevos = filas.filter(f => !yaEstaban.has(f.email));
  if (nuevos.length > 0) {
    const { error } = await db.from('plataforma_lead').insert(nuevos);
    if (error) {
      return NextResponse.json({ error: `No se han podido importar: ${error.message}` }, { status: 500 });
    }
  }

  let actualizados = 0;
  for (const f of filas.filter(x => yaEstaban.has(x.email))) {
    const { error } = await db.from('plataforma_lead').update({
      web: f.web, instagram: f.instagram,
      software_actual: f.software_actual,
      ciudad: f.ciudad, telefono: f.telefono,
      actualizado_en: ahora,
    }).eq('email', f.email);
    if (!error) actualizados++;
  }

  await registrar(db, req, {
    actor: g.admin,
    accion: 'prospeccion.importada',
    objetivoTipo: 'plataforma_lead',
    resumen: `Importados ${nuevos.length} prospectos nuevos, ${actualizados} actualizados, ${rechazadas.length} rechazados`,
    despues: { nuevos: nuevos.length, actualizados, rechazados: rechazadas.length },
  });

  return NextResponse.json({
    ok: true,
    nuevos: nuevos.length,
    actualizados,
    rechazadas: rechazadas.map(r => ({ fila: r.fila, motivo: r.motivo })),
  });
}
