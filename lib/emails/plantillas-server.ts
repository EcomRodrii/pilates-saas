import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import type { PersonalizacionPlantilla } from '@/lib/emails/cuerpo-editable';

// ─────────────────────────────────────────────────────────────────────────────
// Resuelve el override de plantilla de email de un estudio (asunto + intro).
// Solo servidor (usa service-role). Si no hay override, o está desactivado, o el
// tipo no es editable, devuelve {} y el emisor cae a los textos por defecto.
// ─────────────────────────────────────────────────────────────────────────────

// `asunto`/`intro` son los dos campos de siempre. El resto es la
// personalización total (migr 20260811005749): con `cuerpo` la propietaria
// escribe el correo entero y las plantillas dejan de pintar su estructura fija.
// Todo opcional — ausente significa "como siempre", en cada campo por separado.
export type PlantillaOverride = { asunto?: string; intro?: string } & PersonalizacionPlantilla;

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
    .select('asunto, intro, activa, cuerpo, boton_texto, color_cabecera, color_boton, logo_url, pie, fuente')
    .eq('studio_id', studioId)
    .eq('tipo', tipo)
    .maybeSingle();
  if (!data || data.activa === false) return {};
  // Un campo en blanco vale lo mismo que un campo sin rellenar: la propietaria
  // borra el contenido de una casilla para volver a lo de siempre, sin tener
  // que buscar un botón de "restablecer".
  const texto = (v: unknown) => (v as string | null)?.trim() || undefined;
  return {
    asunto: texto(data.asunto),
    intro: texto(data.intro),
    cuerpo: texto(data.cuerpo),
    botonTexto: texto(data.boton_texto),
    colorCabecera: texto(data.color_cabecera),
    colorBoton: texto(data.color_boton),
    logoUrl: texto(data.logo_url),
    pie: texto(data.pie),
    fuente: texto(data.fuente),
  };
}

export type VarsPlantilla = { nombre?: string; estudio?: string; clase?: string };

// Sustituye las variables permitidas en el texto editable por el estudio.
// Ojo: NO toca {datos} ni {boton}, que son tokens de maquetación y los resuelve
// el render (lib/emails/cuerpo-editable.tsx), no esta sustitución de texto.
export function interpolar(texto: string, vars: VarsPlantilla): string {
  return texto
    .replace(/\{nombre\}/gi, vars.nombre ?? '')
    .replace(/\{estudio\}/gi, vars.estudio ?? '')
    .replace(/\{clase\}/gi, vars.clase ?? '');
}

// Los textos largos de la personalización llevan las mismas variables que el
// asunto y la introducción. Se interpolan aquí, en un solo sitio, para que
// ningún emisor se deje uno y salga un "{nombre}" crudo en el correo.
export function interpolarPersonalizacion(
  p: PlantillaOverride,
  vars: VarsPlantilla,
): PersonalizacionPlantilla {
  return {
    ...p,
    cuerpo: p.cuerpo ? interpolar(p.cuerpo, vars) : undefined,
    pie: p.pie ? interpolar(p.pie, vars) : undefined,
    botonTexto: p.botonTexto ? interpolar(p.botonTexto, vars) : undefined,
  };
}

export type MarcaEstudio = { nombre?: string | null; colorPrimario?: string | null; logoUrl?: string | null; slug?: string | null };

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
    .select('nombre, color_primario, logo_url, slug')
    .eq('id', studioId)
    .maybeSingle();
  if (!data) return {};
  return {
    nombre: data.nombre as string | null,
    colorPrimario: (data.color_primario as string | null) ?? undefined,
    logoUrl: data.logo_url as string | null,
    slug: data.slug as string | null,
  };
}

export function appUrl(): string {
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
