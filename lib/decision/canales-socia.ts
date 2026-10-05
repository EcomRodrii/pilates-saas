// La mitad de servidor de `canalesSocia` (efecto-aprobar.ts): por dónde le
// llegaría a cada socia el mensaje de su recomendación si se aprobara AHORA,
// con su ficha y el WhatsApp Business del estudio de ahora. Lo usan GET
// /api/decisiones (el `efecto` que pinta cada botón) y las rutas de aprobar y de
// «Ya la he contactado», que lo vuelven a calcular antes de ejecutar nada.
//
// Una consulta de fichas, acotada al estudio (con service-role no hay RLS que
// lo haga: un `socio_id` de otro estudio se queda sin ficha y sin canal), y la
// del WhatsApp solo si alguna recomendación lo usaría.
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { whatsappDelEstudio } from '@/lib/whatsapp-estudio';
import { canalesSocia, emailConfigurado, type CanalesSocia } from './efecto-aprobar.ts';
import type { Recomendacion } from './tipos.ts';

const LE_ESCRIBEN = new Set(['ENVIAR_EMAIL', 'CONTACTO_MANUAL']);

/**
 * `undefined` para las que no le escriben a nadie, y para todas si no se han
 * podido leer las fichas: entonces el botón se queda como estaba, porque el
 * ejecutor ya no da por enviado un mensaje que no sale (falla y lo dice).
 */
export async function canalesDeSocias(
  studioId: string,
  recomendaciones: readonly Recomendacion[],
): Promise<(r: Recomendacion) => CanalesSocia | undefined> {
  const conSocia = recomendaciones.filter(r => LE_ESCRIBEN.has(r.accion.tipo) && r.socioId);
  if (conSocia.length === 0) return () => undefined;

  const ids = [...new Set(conSocia.map(r => r.socioId as string))];
  const { data, error } = await requireSupabaseAdmin()
    .from('socios').select('id, email, telefono').eq('studio_id', studioId).in('id', ids);
  if (error) return () => undefined;
  const fichas = new Map((data ?? []).map(s => [s.id as string, s as { email: string | null; telefono: string | null }]));

  const algunaPorWhatsapp = conSocia.some(r =>
    r.accion.tipo === 'CONTACTO_MANUAL' && r.accion.canal === 'WHATSAPP' && !!fichas.get(r.socioId as string)?.telefono);
  const whatsappConectado = algunaPorWhatsapp
    ? !!whatsappDelEstudio(await dbGetIntegracionConfig(studioId, 'WHATSAPP'))
    : false;
  const conEmail = emailConfigurado(process.env.RESEND_API_KEY);

  return (r) => {
    if (!LE_ESCRIBEN.has(r.accion.tipo) || !r.socioId) return undefined;
    return canalesSocia({ accion: r.accion, socia: fichas.get(r.socioId) ?? null, whatsappConectado, emailConfigurado: conEmail });
  };
}
