import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVerFichaClinica } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaCambioConsentimiento } from '@/lib/datos-salud/consentimiento';
import { comprobarAccesoSaludSocia } from '@/lib/datos-salud/acceso-servidor';

// Retirar el consentimiento de salud de una socia desde el panel (p. ej. lo
// pide en mostrador). Sella `consentimiento_salud_revocado_en` SIN borrar la
// fecha, la firma ni el texto —son la prueba de lo que hubo— y apunta el evento
// en `consentimientos_salud_eventos`.
//
// Efecto: los datos de salud quedan BLOQUEADOS (la RLS exige consentimiento
// vigente, así que dejan de ser visibles para todo el personal). No se borran:
// eso es la supresión, una petición aparte. ⚠️ Decisión legal pendiente.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFichaClinica(sesion.rol)) {
    return NextResponse.json({ error: 'Solo la dirección o una instructora pueden retirar este consentimiento.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-consentimiento-salud-revocar', { max: 20, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id: socioId } = await params;
  const acceso = await comprobarAccesoSaludSocia(sesion, socioId, { exigirConsentimiento: false });
  if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 500 });

  try {
    const { data: resultado, error } = await admin.rpc('consentimiento_salud_cambiar', {
      p_studio_id: sesion.studioId,
      p_socio_id: socioId,
      p_tipo: 'REVOCADO',
      p_origen: 'PANEL',
      p_texto: null,
      p_firma: null,
      p_actor_uid: sesion.userId,
      p_actor_rol: sesion.rol,
    });
    if (error) return errorInterno('socios/consentimiento-salud/revocar:POST', error, 'No se ha podido retirar el consentimiento.');
    const r = respuestaCambioConsentimiento(resultado);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, cambiado: r.cambiado, consentimiento: null });
  } catch (e) {
    return errorInterno('socios/consentimiento-salud/revocar:POST', e, 'No se ha podido retirar el consentimiento.');
  }
}
