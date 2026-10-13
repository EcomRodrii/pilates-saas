// La mitad de servidor de `canalesSocia` (efecto-aprobar.ts): por dónde le
// llegaría a cada socia el mensaje de su recomendación si se aprobara AHORA,
// con su ficha y el WhatsApp Business del estudio de ahora. Lo usan GET
// /api/decisiones (el `efecto` que pinta cada botón), las rutas de aprobar y de
// «Ya la he contactado», que lo vuelven a calcular antes de ejecutar nada, y el
// piloto automático, que no aprueba lo que no podría mandar.
//
// Una consulta de fichas, acotada al estudio (con service-role no hay RLS que
// lo haga: un `socio_id` de otro estudio se queda sin ficha y sin canal), la
// del WhatsApp solo si alguna recomendación lo usaría, y las del permiso para
// ofertas solo si alguna lleva un mensaje comercial.
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { textoConsentimientoVigente } from '@/lib/db/consentimiento-marketing-admin';
import { rebotesDeEmails } from '@/lib/emails/rebotes-consulta';
import { normalizarEmail } from '@/lib/emails/rebotes';
import { tieneConsentimientoMarketingVigente } from '@/lib/marketing/consentimiento';
import { whatsappDelEstudio } from '@/lib/whatsapp-estudio';
import { canalesSocia, emailConfigurado, type CanalesSocia } from './efecto-aprobar.ts';
import { mensajeParaSocia } from './mensajes-socia.ts';
import type { Recomendacion } from './tipos.ts';

const LE_ESCRIBEN = new Set(['ENVIAR_EMAIL', 'CONTACTO_MANUAL']);

/** Lo que decide si un mensaje comercial puede salir hacia una socia. */
export interface PermisoComercial {
  consentimientoVigente: boolean;
  correoRoto: boolean;
}

/** ¿Lo que se le mandaría a esta socia es comercial? Sin mensaje para ella, no se le manda nada. */
export function esComercial(r: Pick<Recomendacion, 'tipo' | 'datosUsados'>): boolean {
  return mensajeParaSocia(r.tipo, r.datosUsados, '')?.comercial === true;
}

/**
 * Su consentimiento de novedades vigente (el texto exacto de hoy, con el nombre
 * del estudio) y si su correo está marcado como roto. Lo usan esta pantalla y
 * los dos ejecutores, que lo vuelven a mirar al enviar. LANZA si no se puede
 * leer: un fallo de lectura no es un «sí».
 */
export async function permisoComercial(
  studioId: string,
  socias: readonly { id: string; email: string | null; consentimiento_marketing_texto: string | null }[],
): Promise<Map<string, PermisoComercial>> {
  if (socias.length === 0) return new Map();
  const admin = requireSupabaseAdmin();
  const [texto, rotos] = await Promise.all([
    textoConsentimientoVigente(admin, studioId),
    rebotesDeEmails(admin, socias.map(s => s.email)),
  ]);
  return new Map(socias.map(s => [s.id, {
    consentimientoVigente: tieneConsentimientoMarketingVigente(s.consentimiento_marketing_texto ?? undefined, texto),
    correoRoto: !!s.email && rotos.has(normalizarEmail(s.email)),
  }]));
}

/**
 * `undefined` para las que no le escriben a nadie, y para todas si no se han
 * podido leer las fichas o el permiso para ofertas: entonces el botón se queda
 * como estaba, porque el ejecutor ya no da por enviado un mensaje que no sale
 * (vuelve a mirarlo, falla y lo dice).
 */
export async function canalesDeSocias(
  studioId: string,
  recomendaciones: readonly Recomendacion[],
): Promise<(r: Recomendacion) => CanalesSocia | undefined> {
  const conSocia = recomendaciones.filter(r => LE_ESCRIBEN.has(r.accion.tipo) && r.socioId);
  if (conSocia.length === 0) return () => undefined;

  const ids = [...new Set(conSocia.map(r => r.socioId as string))];
  const { data, error } = await requireSupabaseAdmin()
    .from('socios').select('id, email, telefono, consentimiento_marketing_texto').eq('studio_id', studioId).in('id', ids);
  if (error) return () => undefined;
  type Ficha = { id: string; email: string | null; telefono: string | null; consentimiento_marketing_texto: string | null };
  const fichas = new Map((data ?? []).map(s => [s.id as string, s as Ficha]));

  const algunaPorWhatsapp = conSocia.some(r =>
    r.accion.tipo === 'CONTACTO_MANUAL' && r.accion.canal === 'WHATSAPP' && !!fichas.get(r.socioId as string)?.telefono);
  const whatsappConectado = algunaPorWhatsapp
    ? !!whatsappDelEstudio(await dbGetIntegracionConfig(studioId, 'WHATSAPP'))
    : false;
  const conEmail = emailConfigurado(process.env.RESEND_API_KEY);

  const deComerciales = [...new Set(conSocia.filter(esComercial).map(r => r.socioId as string))]
    .map(id => fichas.get(id)).filter((f): f is Ficha => !!f);
  let permisos: Map<string, PermisoComercial>;
  try {
    permisos = await permisoComercial(studioId, deComerciales);
  } catch {
    return () => undefined;
  }

  return (r) => {
    if (!LE_ESCRIBEN.has(r.accion.tipo) || !r.socioId) return undefined;
    const permiso = permisos.get(r.socioId);
    return canalesSocia({
      accion: r.accion, socia: fichas.get(r.socioId) ?? null, whatsappConectado, emailConfigurado: conEmail,
      comercial: esComercial(r),
      consentimientoVigente: permiso?.consentimientoVigente ?? false,
      correoRoto: permiso?.correoRoto ?? false,
    });
  };
}
