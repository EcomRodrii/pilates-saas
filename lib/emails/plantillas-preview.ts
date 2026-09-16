import { correoReserva, correoRecordatorio, correoCancelacionClase, correoPlazaLiberada } from '@/lib/emails/estudio/clase';
import { marcaCorreoDesde } from '@/lib/emails/estudio/marca-correo';
import { correoBienvenida } from '@/lib/emails/estudio/cuenta';
import { correoImpago } from '@/lib/emails/estudio/cobros';
import { appUrl, interpolar, interpolarPersonalizacion, resolverMarcaEstudio, type MarcaEstudio, type TipoPlantillaEditable } from '@/lib/emails/plantillas-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Nombre del estudio + marca (logo/color) en una sola llamada: lo usan las dos
// rutas (preview y envío de prueba) para no repetir el mismo par de queries.
export async function resolverContextoEstudio(studioId: string): Promise<{ nombre: string; marca: MarcaEstudio }> {
  const admin = getSupabaseAdmin();
  const [{ data: studio }, marca] = await Promise.all([
    admin ? admin.from('studios').select('nombre').eq('id', studioId).maybeSingle() : Promise.resolve({ data: null }),
    resolverMarcaEstudio(studioId),
  ]);
  return { nombre: (studio?.nombre as string | null) ?? 'Tu estudio', marca };
}

// ─────────────────────────────────────────────────────────────────────────────
// P2-11. "Solo 5 plantillas, sin preview ni envío de prueba." La propietaria
// escribía un asunto y un texto de introducción a ciegas — el único modo de
// saber si sonaban bien era esperar a que una clienta real recibiera el
// email. Este módulo renderiza CUALQUIER plantilla editable con una socia y
// una clase de muestra, tanto para la vista previa (sin guardar) como para el
// envío de prueba (comparten exactamente el mismo HTML).
// ─────────────────────────────────────────────────────────────────────────────

const SOCIA_MUESTRA = 'Ana García';
const CLASE_MUESTRA = 'Reformer Iniciación';
const DATOS_CLASE_MUESTRA = { fecha: 'Lunes 4 de agosto', hora: '09:00', sala: 'Sala 1', instructor: 'Marta' };

// Enlace de pega para la bienvenida. En el envío real es un magic link de
// Supabase que se genera al vuelo; en la muestra no hay ninguno, y sin él el
// email salía SIN BOTÓN. Con el cuerpo libre eso se notó de verdad: la
// propietaria escribe el texto de su botón, le da a la vista previa y no ve
// ningún botón por ninguna parte, sin nada que le explique por qué.
const URL_MUESTRA = `${appUrl()}/portal/ejemplo`;

// El BORRADOR tal cual está en el formulario del panel, sin guardar. Mismos
// campos que `plantillas_email`, todos opcionales y admitiendo null porque el
// formulario manda null para "vacío, usa lo de siempre".
export type BorradorPlantilla = {
  asunto?: string | null;
  intro?: string | null;
  cuerpo?: string | null;
  botonTexto?: string | null;
  colorCabecera?: string | null;
  colorBoton?: string | null;
  logoUrl?: string | null;
  pie?: string | null;
  fuente?: string | null;
};

export async function renderPlantillaMuestra(
  tipo: TipoPlantillaEditable,
  override: BorradorPlantilla,
  marca: MarcaEstudio,
  estudioNombre: string,
): Promise<{ html: string; subject: string }> {
  const vars = { nombre: SOCIA_MUESTRA, estudio: estudioNombre, clase: CLASE_MUESTRA };
  const intro = override.intro?.trim() ? interpolar(override.intro, vars) : undefined;
  const asuntoOverride = override.asunto?.trim() ? interpolar(override.asunto, vars) : undefined;
  // Mismo camino que en el envío real (interpolarPersonalizacion): si la vista
  // previa resolviera las variables por su cuenta, acabaría enseñando algo
  // distinto de lo que recibe la clienta, que es justo lo que esto evita.
  const personalizacion = interpolarPersonalizacion(
    {
      cuerpo: override.cuerpo?.trim() || undefined,
      botonTexto: override.botonTexto?.trim() || undefined,
      colorCabecera: override.colorCabecera?.trim() || undefined,
      colorBoton: override.colorBoton?.trim() || undefined,
      logoUrl: override.logoUrl?.trim() || undefined,
      pie: override.pie?.trim() || undefined,
      fuente: override.fuente?.trim() || undefined,
    },
    vars,
  );
  const marcaCorreo = marcaCorreoDesde(marca, estudioNombre);
  // Los correos ya migrados al sistema del estudio reciben la marca como un
  // objeto. La URL de muestra es la misma que la bienvenida: sin ella la
  // propietaria escribiría el texto de su botón y no vería ningún botón.
  const conClaseEstudio = {
    socioNombre: SOCIA_MUESTRA, intro, personalizacion,
    claseNombre: CLASE_MUESTRA, ...DATOS_CLASE_MUESTRA,
    marca: marcaCorreo, url: URL_MUESTRA,
  };

  switch (tipo) {
    case 'bienvenida':
      return {
        html: correoBienvenida({ socioNombre: SOCIA_MUESTRA, intro, personalizacion, marca: marcaCorreo, planNombre: 'Mensual Ilimitado', url: URL_MUESTRA }),
        subject: asuntoOverride ?? `¡Bienvenida a ${estudioNombre}!`,
      };
    case 'reserva':
      return { html: correoReserva(conClaseEstudio), subject: asuntoOverride ?? `Reserva confirmada — ${CLASE_MUESTRA}` };
    case 'recordatorio':
      return { html: correoRecordatorio(conClaseEstudio), subject: asuntoOverride ?? `Recordatorio — ${CLASE_MUESTRA}` };
    case 'cancelacion':
      return { html: correoCancelacionClase({ ...conClaseEstudio, bonoDevuelto: true }), subject: asuntoOverride ?? `Clase cancelada — ${CLASE_MUESTRA}` };
    case 'promocion':
      return { html: correoPlazaLiberada(conClaseEstudio), subject: asuntoOverride ?? `Se ha liberado tu plaza — ${CLASE_MUESTRA}` };
    case 'impago':
      return {
        html: correoImpago({ socioNombre: SOCIA_MUESTRA, intro, personalizacion, marca: marcaCorreo, concepto: 'Cuota de agosto', importe: 45, definitivo: false }),
        subject: asuntoOverride ?? 'Problema con tu pago — Cuota de agosto',
      };
  }
}
