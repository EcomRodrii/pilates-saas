import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { asuntoDeContacto, validarContacto } from '@/lib/clientas/contactos';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Apuntar un contacto con una clienta: «la llamé y se lo piensa».
//
// Se guarda en `comunicaciones_socio` (tipo 'contacto') con service_role, así
// que lo que la RLS haría lo hace esta ruta: el rol (gestionar clientas, el de
// su ficha), el estudio SIEMPRE de la sesión, y que la socia sea de ese estudio
// y no esté borrada.
//
// No reutiliza `registrarComunicacion`: aquella está hecha para no fallar nunca
// (un correo que SÍ salió no puede dar error por el registro) y se traga el
// fallo del INSERT. Aquí el INSERT es la acción entera, así que si no se guarda,
// la pantalla tiene que enterarse: 500, nunca un «apuntado» que no está.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para apuntar contactos con clientas.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-contactos', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id: socioId } = await params;
  const validacion = validarContacto(await req.json().catch(() => null), new Date());
  if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const { canal, resultado, nota, en } = validacion.contacto;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data: socia, error: errSocia } = await admin.from('socios')
      .select('id')
      .eq('id', socioId).eq('studio_id', sesion.studioId).is('borrado_en', null)
      .maybeSingle();
    if (errSocia) return errorInterno('socios:contactos:leer', errSocia, 'No se ha podido leer la ficha. No se ha apuntado nada.');
    if (!socia) return NextResponse.json({ error: 'No se encuentra esta clienta.' }, { status: 404 });

    const id = uid();
    const { error } = await admin.from('comunicaciones_socio').insert({
      id,
      studio_id: sesion.studioId,
      socio_id: socioId,
      tipo: 'contacto',
      asunto: asuntoDeContacto(canal, resultado),
      estado: 'ENVIADO',
      canal,
      resultado,
      nota,
      creado_por: sesion.userId,
      creado_por_nombre: sesion.nombre,
      creado_en: en,
    });
    if (error) return errorInterno('socios:contactos:apuntar', error, 'No se ha podido apuntar el contacto. Vuelve a intentarlo.');
    return NextResponse.json({ id, en }, { status: 201 });
  } catch (e) {
    return errorInterno('socios:contactos', e, 'No se ha podido apuntar el contacto. Vuelve a intentarlo.');
  }
}
