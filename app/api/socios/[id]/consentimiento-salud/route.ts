import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVerFichaClinica } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { textoConsentimientoSaludPanel } from '@/lib/legal-textos';
import { normalizarFirma, respuestaCambioConsentimiento } from '@/lib/datos-salud/consentimiento';
import { comprobarAccesoSaludSocia } from '@/lib/datos-salud/acceso-servidor';

// Registrar el consentimiento de datos de salud (art. 9 RGPD) desde el panel,
// con la socia delante.
//
// Lo que antes decidía el navegador y ahora decide el servidor:
//  · la FECHA (now() en la RPC, no el reloj del dispositivo),
//  · QUIÉN lo registra (`sesion.userId` y su rol, del JWT),
//  · el TEXTO aceptado (derivado aquí con el nombre del estudio de la BD; si
//    llega un `texto` en el cuerpo, se ignora),
//  · y QUIÉN PUEDE: rol clínico, y si es instructora, que sea su alumna.
// Lo único que viene del cliente es la firma tecleada.
//
// Escribe solo `consentimiento_salud_cambiar` (service_role): `authenticated`
// ya no tiene INSERT/UPDATE sobre esas columnas (migr 20260913173100).

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFichaClinica(sesion.rol)) {
    return NextResponse.json({ error: 'Solo la dirección o una instructora pueden registrar este consentimiento.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-consentimiento-salud', { max: 20, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id: socioId } = await params;
  const body = (await req.json().catch(() => null)) as { firma?: unknown } | null;
  const firma = normalizarFirma(body?.firma);
  if (!firma) {
    return NextResponse.json({ error: 'Escribe el nombre completo de quien autoriza.' }, { status: 400 });
  }

  const acceso = await comprobarAccesoSaludSocia(sesion, socioId, { exigirConsentimiento: false });
  if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 500 });

  try {
    const { data: studio } = await admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle();
    const texto = textoConsentimientoSaludPanel({ nombre: (studio?.nombre as string | null) ?? null });

    const { data: resultado, error } = await admin.rpc('consentimiento_salud_cambiar', {
      p_studio_id: sesion.studioId,
      p_socio_id: socioId,
      p_tipo: 'OTORGADO',
      p_origen: 'PANEL',
      p_texto: texto,
      p_firma: firma,
      p_actor_uid: sesion.userId,
      p_actor_rol: sesion.rol,
    });
    if (error) return errorInterno('socios/consentimiento-salud:POST', error, 'No se ha podido guardar el consentimiento.');
    const r = respuestaCambioConsentimiento(resultado);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

    // Se devuelve lo que QUEDÓ guardado (si ya constaba, la firma anterior).
    const { data: fila } = await admin.from('socios')
      .select('consentimiento_salud_fecha, consentimiento_salud_registrado_por, consentimiento_salud_revocado_en')
      .eq('id', socioId).eq('studio_id', sesion.studioId).maybeSingle();
    const vigente = Boolean(fila?.consentimiento_salud_fecha) && !fila?.consentimiento_salud_revocado_en;
    return NextResponse.json({
      ok: true,
      cambiado: r.cambiado,
      consentimiento: vigente
        ? { fecha: fila!.consentimiento_salud_fecha as string, registradoPor: (fila!.consentimiento_salud_registrado_por as string | null) ?? '' }
        : null,
    });
  } catch (e) {
    return errorInterno('socios/consentimiento-salud:POST', e, 'No se ha podido guardar el consentimiento.');
  }
}
