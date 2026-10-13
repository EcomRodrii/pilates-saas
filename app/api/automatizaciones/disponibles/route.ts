import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarAutomatizaciones } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { fetchAllRows } from '@/lib/supabase-data';
import { reglasOpcionalesEncendidas } from '@/lib/engines/reglas-opcionales';
import { alcanceCumple, correosCandidatosCumple, type AlcanceCumple, type FilaAlcanceCumple } from '@/lib/engines/alcance-cumple';
import { rebotesDeEmails } from '@/lib/emails/rebotes-consulta';
import { normalizarEmail } from '@/lib/emails/rebotes';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { hoyEnEstudio } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Qué reglas opcionales de Automatizaciones (P3.10) puede usar este estudio y,
// para la que esté encendida, a cuántas clientas llegaría hoy. La pantalla solo
// ofrece una regla opcional si esto dice que sí; el motor lo vuelve a mirar
// antes de mandar nada (lib/engines/reglas-opcionales.ts).
//
// ⚠️ Las lecturas van con service-role: el estudio sale SIEMPRE de la sesión y
// el rol se comprueba AQUÍ (Automatizaciones es solo de la propietaria). Solo
// devuelve cifras: ni nombres ni fechas.
//
// `cumpleanos: null` = apagada para este estudio. `alcance: null` = encendida,
// pero no se ha podido contar: la pantalla lo dice en vez de inventar un cero.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarAutomatizaciones(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const sinCache = { 'Cache-Control': 'no-store' };
  const studioId = sesion.studioId;
  if (!reglasOpcionalesEncendidas(studioId).has('CUMPLEANOS')) {
    return NextResponse.json({ cumpleanos: null }, { headers: sinCache });
  }

  const limited = await enforceRateLimit(req, 'automatizaciones-disponibles', { max: 30, windowSeconds: 60 }, studioId);
  if (limited) return limited;

  return NextResponse.json({ cumpleanos: { alcance: await contarAlcance(studioId) } }, { headers: sinCache });
}

async function contarAlcance(studioId: string): Promise<AlcanceCumple | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const [estudio, socias] = await Promise.all([
    admin.from('studios').select('nombre').eq('id', studioId).maybeSingle(),
    fetchAllRows<FilaAlcanceCumple>(studioId, 'socios', (from, to) => admin.from('socios')
      .select('activo, email, fecha_nacimiento, consentimiento_marketing_texto')
      .eq('studio_id', studioId).is('borrado_en', null).order('id').range(from, to)),
  ]);
  if (estudio.error || !estudio.data || socias.error) return null;
  // El mismo texto con el que el cron compara (lib/inngest/automatizaciones.ts).
  const texto = textoConsentimientoMarketing({ nombre: (estudio.data as { nombre: string | null }).nombre ?? undefined });
  const hoy = hoyEnEstudio();
  // Lo que el envío tampoco escribiría (procesarCandidato): buzones rotos y
  // dominios de ejemplo. Si no se puede leer, no hay cifra: mejor «no he podido
  // contar» que una de más.
  let rotos: Set<string>;
  try {
    rotos = new Set((await rebotesDeEmails(admin, correosCandidatosCumple(socias.data, texto, hoy))).keys());
  } catch {
    return null;
  }
  return alcanceCumple(socias.data, texto, hoy, e => rotos.has(normalizarEmail(e)) || esDominioReservado(e));
}
