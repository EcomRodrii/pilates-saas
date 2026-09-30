import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { errorInterno } from '@/lib/errores-servidor';
import {
  listarParaTentare, verificarRepresentacion, rechazarRepresentacion, activarProduccion,
  pausarPorTentare, reanudarPorTentare, decidirNoRemitirAnteriores, deshacerNoRemitirAnteriores, AltaVerifactuError,
} from '@/lib/verifactu/estudio-servidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lado Tentare del alta Veri*Factu: verificar el poder IZ860 que cada estudio
// dice haber otorgado (lo comprueba el apoderado en «Consulta de apoderamientos
// recibidos» de la sede y coteja el CSV) y activar/pausar la producción.
//
// `admin.full` (solo el CEO): el apoderado es una persona concreta y es ella la
// que ve sus apoderamientos recibidos en la AEAT; activar producción es enviar
// registros fiscales reales en nombre de un estudio.

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'admin.full');
  if ('error' in g) return g.error;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    return NextResponse.json(await listarParaTentare(admin));
  } catch (err) {
    return errorInterno('interno/verifactu/estudios:GET', err, 'No se ha podido leer el estado de Veri*Factu.');
  }
}

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'admin.full');
  if ('error' in g) return g.error;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const accion = String(body?.accion ?? '');
  const userId = g.admin.userId;
  try {
    let objetivo = '';
    switch (accion) {
      case 'verificar':
        objetivo = String(body?.representacionId ?? '');
        await verificarRepresentacion(admin, objetivo, {
          referenciaAeat: String(body?.referenciaAeat ?? ''),
          csvCotejado: body?.csvCotejado === true,
          tramiteComprobado: body?.tramiteComprobado === 'GENERAL_46_2' ? 'GENERAL_46_2' : 'IZ860',
        }, userId);
        break;
      case 'rechazar':
        objetivo = String(body?.representacionId ?? '');
        await rechazarRepresentacion(admin, objetivo, String(body?.motivo ?? ''), userId);
        break;
      case 'activar_produccion':
        objetivo = String(body?.studioId ?? '');
        await activarProduccion(admin, objetivo, userId);
        break;
      case 'pausar':
        objetivo = String(body?.studioId ?? '');
        await pausarPorTentare(admin, objetivo, String(body?.motivo ?? ''), userId);
        break;
      case 'reanudar':
        objetivo = String(body?.studioId ?? '');
        await reanudarPorTentare(admin, objetivo, userId);
        break;
      // Las facturas anteriores a la activación (criterio del fiscalista, 30-sep-2026).
      case 'no_remitir_anteriores':
        objetivo = String(body?.studioId ?? '');
        await decidirNoRemitirAnteriores(admin, objetivo, { motivo: String(body?.motivo ?? ''), criterio: String(body?.criterio ?? '') }, userId);
        break;
      case 'deshacer_no_remitir':
        objetivo = String(body?.studioId ?? '');
        await deshacerNoRemitirAnteriores(admin, objetivo, String(body?.motivo ?? ''), userId);
        break;
      default:
        return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
    }
    await registrar(admin, req, {
      actor: g.admin, accion: `verifactu.${accion}`, objetivoTipo: accion.startsWith('verificar') || accion === 'rechazar' ? 'verifactu_representacion' : 'studio',
      objetivoId: objetivo, resumen: `Veri*Factu: ${accion}`,
    });
    return NextResponse.json(await listarParaTentare(admin));
  } catch (err) {
    if (err instanceof AltaVerifactuError) return NextResponse.json({ error: err.message, errores: err.errores }, { status: err.status });
    return errorInterno('interno/verifactu/estudios:POST', err, 'No se ha podido completar la acción.');
  }
}
