// La bienvenida: el primer correo que una alumna recibe de su estudio, y el
// único cuyo botón abre una cuenta. Todo lo demás lo pone `correoEstudio`.

import { correoEstudio, correoEstudioLibre, type MarcaCorreo } from './plantilla.ts';
import type { PersonalizacionCorreo } from './clase.ts';
import { marcaConPersonalizacion } from './clase.ts';

export interface PropsBienvenida {
  socioNombre: string;
  /** El plan que acaba de contratar. Ausente = no se pinta la tarjeta. */
  planNombre?: string | null;
  marca: MarcaCorreo;
  intro?: string | null;
  personalizacion?: PersonalizacionCorreo | null;
  /**
   * Enlace de acceso (magic link de Supabase, generado al vuelo). Sin él el
   * correo sale igual, solo sin botón — ver `generarEnlaceAccesoSocia`.
   */
  url?: string | null;
}

export function correoBienvenida(p: PropsBienvenida): string {
  const boton = p.url ? { href: p.url, texto: p.personalizacion?.botonTexto || 'Activar mi acceso' } : null;
  const base = {
    marca: marcaConPersonalizacion(p.marca, p.personalizacion),
    detalle: p.planNombre ? { filas: [{ label: 'Tu plan', value: p.planNombre }] } : undefined,
    boton,
    pie: p.personalizacion?.pie ?? null,
    conPortada: true,
    firma: `Con cariño, el equipo de ${p.marca.estudioNombre}`,
  };
  const preheader = `Ya eres parte de ${p.marca.estudioNombre}`;
  if (p.personalizacion?.cuerpo) {
    return correoEstudioLibre({ ...base, preheader, titular: '', cuerpo: p.personalizacion.cuerpo });
  }
  return correoEstudio({
    ...base,
    preheader,
    titular: `Bienvenida a ${p.marca.estudioNombre}`,
    parrafos: [
      p.intro?.trim() || `Hola ${p.socioNombre}, estamos encantadas de tenerte aquí.`,
      // Solo se promete el enlace si de verdad hay enlace.
      p.url
        ? 'Ya puedes reservar tus clases desde tu app. Este enlace es tuyo: entra y pon tu contraseña, sin buscar nada más.'
        : 'Ya puedes reservar tus clases. Si tienes cualquier duda, escríbenos.',
    ],
  });
}
