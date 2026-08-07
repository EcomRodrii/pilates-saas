import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { generarYEnviarCierreGestoria } from '@/lib/fiscal/cierre-envio-server';

// Envía el paquete del Cierre de año a la gestoría. El servidor RECOMPUTA el
// cierre desde la BD (no confía en números del cliente), guarda el email de la
// gestoría en el estudio para no volver a pedirlo, y manda el resumen + CSV.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Esta ruta lee facturas e ingresos con service-role (se salta la RLS de 0114)
  // y los MANDA POR EMAIL a una dirección que llega en el body. Sin este control,
  // cualquiera con sesión de personal —una instructora incluida— podía exfiltrar
  // la contabilidad anual completa a su propio correo. La RLS no cubre esto
  // precisamente porque aquí se usa `getSupabaseAdmin`.
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'Solo la propietaria puede enviar el cierre a la gestoría' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { anio?: unknown; email?: unknown; trimestre?: unknown } | null;
  const anio = Number(body?.anio);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  // Modelo 303 de IVA: obligatorio TRIMESTRAL, no solo anual — una gestoría no
  // puede esperar al cierre de año para presentarlo. `trimestre` es opcional
  // (ausente = año completo, como antes).
  const trimestreNum = body?.trimestre == null ? null : Number(body.trimestre);
  if (trimestreNum != null && ![1, 2, 3, 4].includes(trimestreNum)) {
    return NextResponse.json({ error: 'Trimestre no válido' }, { status: 400 });
  }
  const trimestre = trimestreNum as 1 | 2 | 3 | 4 | null;
  if (!Number.isInteger(anio) || anio < 2000) return NextResponse.json({ error: 'Año no válido' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Introduce un email de gestoría válido' }, { status: 400 });

  const sid = sesion.studioId;

  // Guarda el email de la gestoría para no volver a pedirlo (no rompe si
  // falla). Solo tiene sentido cuando lo escribe la propietaria a mano — el
  // cron de envío automático no debe reescribirlo en cada ejecución.
  await admin.from('studios').update({ gestoria_email: email }).eq('id', sid);

  const r = await generarYEnviarCierreGestoria({ studioId: sid, anio, trimestre, email });

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
  return NextResponse.json({ ok: true, email });
}
