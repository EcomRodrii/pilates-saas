import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { estadoDeclaracion, suscribirDeclaracion, DeclaracionIncompletaError } from '@/lib/verifactu/declaracion';
import { errorInterno } from '@/lib/errores-servidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// La declaración responsable la SUSCRIBE el productor del software, no un
// estudio. `admin.full` (solo el CEO: PERMISOS_SOLO_CEO): es una declaración
// con efectos sancionadores (art. 201 bis LGT) que firma una persona concreta.
//
// El texto no viene del cliente: se construye en el servidor con los datos del
// productor de la configuración (`VERIFACTU_PRODUCTOR_*`) y la versión del
// software (`lib/verifactu/sif.ts`). Del cliente solo llegan fecha y lugar.

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'admin.full');
  if ('error' in g) return g.error;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    return NextResponse.json(await estadoDeclaracion(admin));
  } catch (err) {
    return errorInterno('interno/verifactu/declaracion:GET', err, 'No se ha podido leer la declaración.');
  }
}

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'admin.full');
  if ('error' in g) return g.error;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { fecha?: unknown; lugar?: unknown } | null;
  if (typeof body?.fecha !== 'string' || typeof body?.lugar !== 'string') {
    return NextResponse.json({ error: 'Faltan fecha (dd-mm-aaaa) y lugar («Localidad, País»).' }, { status: 400 });
  }
  try {
    const fila = await suscribirDeclaracion(admin, { fecha: body.fecha, lugar: body.lugar, suscritaPor: g.admin.userId });
    await registrar(admin, req, {
      actor: g.admin,
      accion: 'verifactu.declaracion.suscribir',
      objetivoTipo: 'verifactu_declaracion',
      objetivoId: fila.id,
      resumen: `Declaración responsable del SIF suscrita (versión ${fila.version_sif})`,
      despues: { version: fila.version_sif, sha256: fila.texto_sha256, fecha: fila.fecha_suscripcion, lugar: fila.lugar_suscripcion },
    });
    return NextResponse.json({ ok: true, id: fila.id, version: fila.version_sif, sha256: fila.texto_sha256 });
  } catch (err) {
    if (err instanceof DeclaracionIncompletaError) {
      return NextResponse.json({ error: err.message, falta: err.falta }, { status: 400 });
    }
    return errorInterno('interno/verifactu/declaracion:POST', err, 'No se ha podido suscribir la declaración.');
  }
}
