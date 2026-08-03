import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// ─────────────────────────────────────────────────────────────────────────────
// Resuelve el override de plantilla de email de un estudio (asunto + intro).
// Solo servidor (usa service-role). Si no hay override, o está desactivado, o el
// tipo no es editable, devuelve {} y el emisor cae a los textos por defecto.
// ─────────────────────────────────────────────────────────────────────────────

export type PlantillaOverride = { asunto?: string; intro?: string };

// Los 6 transaccionales relacionales que el estudio puede personalizar. `recibo`
// (contenido fiscal) y `automatizacion` (100% dinámico) quedan fuera a propósito.
// `impago` (P2-11) es de las que mueven dinero de verdad y antes no se podía tocar.
export const TIPOS_PLANTILLA_EDITABLES = ['bienvenida', 'reserva', 'recordatorio', 'cancelacion', 'promocion', 'impago'] as const;
export type TipoPlantillaEditable = (typeof TIPOS_PLANTILLA_EDITABLES)[number];

export function esTipoEditable(tipo: string): tipo is TipoPlantillaEditable {
  return (TIPOS_PLANTILLA_EDITABLES as readonly string[]).includes(tipo);
}

export async function resolverPlantilla(studioId: string | null | undefined, tipo: string): Promise<PlantillaOverride> {
  if (!studioId || !esTipoEditable(tipo)) return {};
  const admin = getSupabaseAdmin();
  if (!admin) return {};
  const { data } = await admin
    .from('plantillas_email')
    .select('asunto, intro, activa')
    .eq('studio_id', studioId)
    .eq('tipo', tipo)
    .maybeSingle();
  if (!data || data.activa === false) return {};
  return {
    asunto: (data.asunto as string | null)?.trim() || undefined,
    intro: (data.intro as string | null)?.trim() || undefined,
  };
}

// Sustituye las variables permitidas en el texto editable por el estudio.
export function interpolar(texto: string, vars: { nombre?: string; estudio?: string; clase?: string }): string {
  return texto
    .replace(/\{nombre\}/gi, vars.nombre ?? '')
    .replace(/\{estudio\}/gi, vars.estudio ?? '')
    .replace(/\{clase\}/gi, vars.clase ?? '');
}

export type MarcaEstudio = { colorPrimario?: string | null; logoUrl?: string | null; slug?: string | null };

// Resuelve el logo + color + slug de un estudio para pintarlos en la
// plantilla premium compartida (lib/emails/layout.tsx) y, si hace falta,
// enlazar a su portal (bienvenida). Sin studioId (emails de plataforma, no de
// un estudio concreto) devuelve {} y el layout cae al morado por defecto de
// Tentare. Una sola query: antes `slug` vivía en un resolver aparte que
// repetía la misma consulta a `studios` por el mismo id.
export async function resolverMarcaEstudio(studioId: string | null | undefined): Promise<MarcaEstudio> {
  if (!studioId) return {};
  const admin = getSupabaseAdmin();
  if (!admin) return {};
  const { data } = await admin
    .from('studios')
    .select('color_primario, logo_url, slug')
    .eq('id', studioId)
    .maybeSingle();
  if (!data) return {};
  return {
    colorPrimario: (data.color_primario as string | null) ?? undefined,
    logoUrl: data.logo_url as string | null,
    slug: data.slug as string | null,
  };
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
}

// Genera un enlace de acceso firmado (magic link de Supabase Auth) para que una
// socia active su cuenta sin tener que teclear su email en /portal/{slug}/acceso
// ella misma. Es el MISMO mecanismo que ya usa el login sin contraseña del
// portal (signInWithOtp) — no un token propio: Supabase ya resuelve firma,
// expiración y un solo uso. Fallo suave: si Supabase Admin no está disponible o
// el email no es válido, la bienvenida se manda igual, solo sin el botón de
// acceso directo (ver bienvenida-template.tsx).
export async function generarEnlaceAccesoSocia(slug: string, email: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appUrl()}/portal/${slug}/clave-nueva` },
  });
  if (error || !data?.properties?.action_link) return null;
  return data.properties.action_link;
}
