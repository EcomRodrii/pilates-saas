import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { aBorrador } from '@/lib/interno/prospeccion';

export const runtime = 'nodejs';

// Editar, aprobar o descartar un borrador. Un solo verbo para las tres cosas
// porque la pantalla también las trata como una: se toca el texto y se decide.

interface Cuerpo {
  id?: string;
  asunto?: string;
  cuerpo?: string;
  accion?: 'aprobar' | 'descartar' | 'guardar';
}

export async function PATCH(req: NextRequest) {
  const g = await exigirPermiso(req, 'marketing.send');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Cuerpo | null;
  if (!body?.id) return NextResponse.json({ error: 'Falta el borrador' }, { status: 400 });

  const { data: antes } = await db
    .from('plataforma_prospeccion_email').select('*').eq('id', body.id).maybeSingle();
  if (!antes) return NextResponse.json({ error: 'Ese borrador no existe.' }, { status: 404 });

  // Un correo que ya salió es historia, no un borrador: ni se reescribe ni se
  // vuelve a aprobar. Dejarlo editable haría creer que se puede corregir algo
  // que el destinatario ya tiene en su bandeja.
  if (antes.estado === 'ENVIADO') {
    return NextResponse.json({ error: 'Ese correo ya se envió: no se puede cambiar.' }, { status: 409 });
  }

  const accion = body.accion ?? 'guardar';
  const asunto = body.asunto !== undefined ? body.asunto.trim() : (antes.asunto as string);
  const texto = body.cuerpo !== undefined ? body.cuerpo.trim() : (antes.cuerpo as string);

  if (accion !== 'descartar' && (!asunto || !texto)) {
    return NextResponse.json({ error: 'El asunto y el cuerpo no pueden quedar vacíos.' }, { status: 400 });
  }

  const ahora = new Date().toISOString();
  const fila: Record<string, unknown> = { asunto, cuerpo: texto };

  if (accion === 'aprobar') {
    fila.estado = 'APROBADO';
    fila.aprobado_por = g.admin.userId;
    fila.aprobado_en = ahora;
    fila.error = null;
  } else if (accion === 'descartar') {
    fila.estado = 'DESCARTADO';
    fila.aprobado_por = null;
    fila.aprobado_en = null;
  } else {
    // Editar el texto de un correo ya aprobado lo devuelve a la cola: lo que se
    // aprobó era ESE texto, no el siguiente. Sin esto se podría aprobar algo
    // correcto y cambiarlo después sin que nadie lo revise.
    if (antes.estado === 'APROBADO') {
      fila.estado = 'BORRADOR';
      fila.aprobado_por = null;
      fila.aprobado_en = null;
    }
  }

  const { error } = await db.from('plataforma_prospeccion_email').update(fila).eq('id', body.id);
  if (error) return NextResponse.json({ error: 'No se ha podido guardar.' }, { status: 500 });

  // Solo se audita aprobar y descartar: son las decisiones. Guardar un cambio
  // de redacción no es un hecho que nadie vaya a auditar seis meses después.
  if (accion === 'aprobar' || accion === 'descartar') {
    const { data: lead } = await db
      .from('plataforma_lead').select('estudio, email').eq('id', antes.lead_id).maybeSingle();
    const quien = (lead?.estudio as string | null) ?? (lead?.email as string | null) ?? String(antes.lead_id);
    await registrar(db, req, {
      actor: g.admin,
      accion: accion === 'aprobar' ? 'prospeccion.aprobada' : 'prospeccion.descartada',
      objetivoTipo: 'plataforma_prospeccion_email',
      objetivoId: body.id,
      resumen: `${quien}: correo ${accion === 'aprobar' ? 'aprobado para envío' : 'descartado'}`,
      antes: { estado: antes.estado },
      despues: { estado: fila.estado },
    });
  }

  const { data: despues } = await db
    .from('plataforma_prospeccion_email').select('*').eq('id', body.id).maybeSingle();
  return NextResponse.json({ ok: true, borrador: despues ? aBorrador(despues) : null });
}
