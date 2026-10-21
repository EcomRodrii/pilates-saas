import { NextRequest, NextResponse, after } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { puedeReservarEnServidor } from '@/lib/onboarding/puede-reservar-servidor';
import { apuntarPaso } from '@/lib/alta/embudo-servidor';

// ¿Puede una alumna NUEVA reservar ya desde la página del estudio? Lo pregunta
// «Tu estudio ya puede recibir reservas» al abrirse, una vez, antes de prometer
// que «cualquiera con este enlace puede reservar».
//
// Ruta fina a propósito: la decisión vive en lib/onboarding/puede-reservar.ts,
// donde la ven los tests de node (app/api no la ven).
//
// ⚠️ Cliente service-role: la RLS no filtra. El estudio sale SIEMPRE de la
// sesión, y el rol es el mismo que puede crear la clase que abre esa pantalla
// (`puedeGestionarClientas`, calendario). La respuesta no lleva ningún dato de
// nadie: un veredicto, un motivo y, como mucho, una fecha.

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const admin = requireSupabaseAdmin();
  try {
    const veredicto = await puedeReservarEnServidor(admin, sesion.studioId, new Date());
    // El hito 1 del embudo del alta: una alumna nueva ya puede reservar. Es un
    // hecho del ESTUDIO (lo pregunte quien lo pregunte) y solo el «sí» del
    // servidor cuenta: un «sin comprobar» no es un sí. Después de contestar.
    if (veredicto.estado === 'SI') after(() => apuntarPaso(admin, sesion.studioId, 'clase_reservable'));
    return NextResponse.json(veredicto);
  } catch (e) {
    console.error('[onboarding:puede-reservar]', e);
    return NextResponse.json({ error: 'No se ha podido comprobar' }, { status: 500 });
  }
}
