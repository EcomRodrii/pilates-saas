import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { generarYEnviarCierreGestoria } from '@/lib/fiscal/cierre-envio-server';
import { decidirEnvioGestoria, MENSAJES_ENVIO_GESTORIA, textoCambioGestoria } from '@/lib/fiscal/envio-gestoria-reglas';
import { uid } from '@/lib/utils';

// Envía el paquete del Cierre de año a la gestoría. El servidor RECOMPUTA el
// cierre desde la BD (no confía en números del cliente) y manda el resumen + CSV.
// A quién se manda y quién puede cambiar el email guardado lo decide
// `decidirEnvioGestoria` (lib/fiscal/envio-gestoria-reglas.ts): la propietaria
// elige; recepción solo reenvía al que ya está guardado.

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Esta ruta lee facturas e ingresos con service-role (se salta la RLS de 0114)
  // y los MANDA POR EMAIL. Sin este control, cualquiera con sesión de personal
  // —una instructora incluida— podía exfiltrar la contabilidad anual completa.
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: MENSAJES_ENVIO_GESTORIA.sinPermiso }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { anio?: unknown; email?: unknown; trimestre?: unknown } | null;
  const anio = Number(body?.anio);
  const emailPedido = typeof body?.email === 'string' ? body.email : '';
  // Modelo 303 de IVA: obligatorio TRIMESTRAL, no solo anual — una gestoría no
  // puede esperar al cierre de año para presentarlo. `trimestre` es opcional
  // (ausente = año completo, como antes).
  const trimestreNum = body?.trimestre == null ? null : Number(body.trimestre);
  if (trimestreNum != null && ![1, 2, 3, 4].includes(trimestreNum)) {
    return NextResponse.json({ error: 'Trimestre no válido' }, { status: 400 });
  }
  const trimestre = trimestreNum as 1 | 2 | 3 | 4 | null;
  if (!Number.isInteger(anio) || anio < 2000) return NextResponse.json({ error: 'Año no válido' }, { status: 400 });

  const sid = sesion.studioId;

  const { data: studioRow, error: errorStudio } = await admin
    .from('studios').select('gestoria_email').eq('id', sid).maybeSingle();
  if (errorStudio) {
    return errorInterno('cierre:enviar-gestoria:studio', errorStudio, 'No se ha podido preparar el envío. Inténtalo de nuevo.');
  }
  const emailGuardado = (studioRow?.gestoria_email as string | null | undefined) ?? null;

  const decision = decidirEnvioGestoria({ rol: sesion.rol, emailPedido, emailGuardado });
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });

  // Solo la propietaria llega aquí con `cambiaGuardado`. El email nuevo pasa a
  // ser el del envío trimestral automático, así que el cambio queda en el feed
  // de actividad (que solo ve ella). Si no se guarda, el envío sigue: siempre
  // ha sido así, y no hay rastro que dejar de un cambio que no ocurrió.
  if (decision.cambiaGuardado) {
    const { error: errorGuardar } = await admin.from('studios').update({ gestoria_email: decision.destinatario }).eq('id', sid);
    if (errorGuardar) {
      Sentry.captureException(errorGuardar, { tags: { area: 'cierre', accion: 'gestoria-guardar' } });
    } else {
      const { error: errorRastro } = await admin.from('actividad_reciente').insert({
        id: uid(),
        studio_id: sid,
        tipo: 'GESTORIA_CAMBIADA',
        texto: textoCambioGestoria(emailGuardado, decision.destinatario),
        socio_id: null,
        enlace: '/cierre',
        creado_en: new Date().toISOString(),
        actor_nombre: sesion.nombre,
      });
      if (errorRastro) Sentry.captureException(errorRastro, { tags: { area: 'cierre', accion: 'gestoria-rastro' } });
    }
  }

  const r = await generarYEnviarCierreGestoria({ studioId: sid, anio, trimestre, email: decision.destinatario });

  if (r.sinDatos) {
    const periodo = trimestre ? `el T${trimestre} de ${anio}` : anio;
    return NextResponse.json({ error: `No hay ingresos registrados en ${periodo} para enviar.` }, { status: 400 });
  }
  if (!r.ok) {
    // fetchAllRows puede devolver datos PARCIALES + error si una página falla
    // a media paginación, o el envío de email puede fallar/no estar
    // configurado — ambos casos ya distinguidos dentro de
    // generarYEnviarCierreGestoria, aquí solo se traduce a HTTP.
    return errorInterno(
      'cierre:enviar-gestoria',
      r.error,
      'No se ha podido generar o enviar el cierre. Inténtalo de nuevo.',
    );
  }
  return NextResponse.json({ ok: true, email: decision.destinatario });
}
