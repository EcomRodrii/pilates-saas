import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { DIAS_BAJA_PURGA, purgaEstudiosActiva } from '@/lib/retencion/ciclo-estudios-vencidos';

// «Borrar ya los datos del estudio» (contrato de encargo, 2-oct-2026: al
// terminar, 30 días para descargar y después supresión, «o antes si lo pide»).
//
// Solo la propietaria y solo con el contrato ya terminado
// (`studios.contrato_terminado_en`, que pone la BD). La petición queda en
// `supresion_pedida_en` (solo la escribe el servidor) y el ciclo de baja
// (lib/retencion/avanzar-ciclo-estudios-vencidos.ts) borra en su siguiente
// pasada y lo confirma por correo. Se confirma escribiendo el nombre del
// estudio: no se deshace.

const MS_DIA = 86_400_000;
const normalizar = (s: string) => s.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ');

async function propietaria(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') return { error: NextResponse.json({ error: 'Solo la propietaria puede pedirlo' }, { status: 403 }) };
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  const { data, error } = await admin.from('studios').select('nombre, contrato_terminado_en, supresion_pedida_en').eq('id', sesion.studioId).single();
  if (error || !data) return { error: errorInterno('estudio/supresion:leer', error, 'No se ha podido leer el estudio.') };
  return { sesion, admin, estudio: data as { nombre: string | null; contrato_terminado_en: string | null; supresion_pedida_en: string | null } };
}

export async function GET(req: NextRequest) {
  const g = await propietaria(req);
  if ('error' in g) return g.error;
  const fin = g.estudio.contrato_terminado_en;
  return NextResponse.json({
    nombre: g.estudio.nombre ?? '',
    terminado: !!fin,
    contratoTerminadoEn: fin,
    borradoPrevistoEn: fin ? new Date(new Date(fin).getTime() + DIAS_BAJA_PURGA * MS_DIA).toISOString() : null,
    pedidaEn: g.estudio.supresion_pedida_en,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'estudio-supresion', { max: 5, windowSeconds: 60 });
  if (limited) return limited;
  const g = await propietaria(req);
  if ('error' in g) return g.error;
  if (!g.estudio.contrato_terminado_en) {
    return NextResponse.json({ error: 'Tu suscripción sigue activa: el borrado solo se puede pedir cuando ha terminado.' }, { status: 409 });
  }
  if (g.estudio.supresion_pedida_en) return NextResponse.json({ pedidaEn: g.estudio.supresion_pedida_en });

  const body = await req.json().catch(() => null) as { confirmacion?: unknown } | null;
  const confirmacion = typeof body?.confirmacion === 'string' ? body.confirmacion : '';
  if (!g.estudio.nombre || normalizar(confirmacion) !== normalizar(g.estudio.nombre)) {
    return NextResponse.json({ error: 'Escribe el nombre del estudio tal y como aparece para confirmar.' }, { status: 400 });
  }

  // Solo si sigue terminado en el momento de escribir: una reactivación entre
  // medias la anularía igualmente (el trigger vacía la columna).
  const { data, error } = await g.admin.from('studios').update({ supresion_pedida_en: new Date().toISOString() })
    .eq('id', g.sesion.studioId).not('contrato_terminado_en', 'is', null).select('supresion_pedida_en').single();
  if (error || !data?.supresion_pedida_en) return errorInterno('estudio/supresion:POST', error, 'No se ha podido registrar la petición.');

  if (!purgaEstudiosActiva(process.env)) {
    // Con el borrado automático apagado, el ciclo solo calcula un informe: que
    // alguien de Tentare lo haga, o lo encienda, a tiempo.
    Sentry.captureMessage('[supresion] un estudio ha pedido el borrado de sus datos con PURGA_ESTUDIOS_VENCIDOS apagada', {
      level: 'warning', tags: { area: 'retencion' }, extra: { studioId: g.sesion.studioId },
    });
  }
  return NextResponse.json({ pedidaEn: data.supresion_pedida_en });
}
