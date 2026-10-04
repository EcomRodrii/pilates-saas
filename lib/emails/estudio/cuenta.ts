// La bienvenida: el primer correo que una alumna recibe de su estudio, y el
// único cuyo botón abre una cuenta. Todo lo demás lo pone `correoEstudio`.

import { correoEstudio, correoEstudioLibre, type MarcaCorreo } from './plantilla.ts';
import type { PersonalizacionCorreo } from './clase.ts';
import { marcaConPersonalizacion, botonConPersonalizacion } from './clase.ts';

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
  const boton = botonConPersonalizacion(p.url ? { href: p.url, texto: 'Activar mi acceso' } : null, p.personalizacion);
  const base = {
    marca: marcaConPersonalizacion(p.marca, p.personalizacion),
    detalle: p.planNombre ? { filas: [{ label: 'Tu plan', value: p.planNombre }] } : undefined,
    boton,
    pie: p.personalizacion?.pie ?? null,
    conPortada: p.personalizacion?.mostrarPortada ?? true,
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
      // Solo se promete el enlace si de verdad hay botón: con un destino propio
      // de la propietaria, «este enlace es tuyo» dejaría de ser verdad.
      boton && !p.personalizacion?.botonUrl
        ? 'Ya puedes reservar tus clases desde tu app. Este enlace es tuyo: entra y pon tu contraseña, sin buscar nada más.'
        : 'Ya puedes reservar tus clases. Si tienes cualquier duda, escríbenos.',
    ],
  });
}

/**
 * El código del segundo paso al entrar en la app del estudio (verificación en
 * dos pasos de la alumna o de la instructora, lib/auth/codigo-correo-reglas.ts).
 * Marca del ESTUDIO, nunca la de Tentare: la app es suya. El código no va en el
 * preheader (se leería en la pantalla bloqueada del móvil).
 */
export function correoCodigoAccesoEstudio(p: { codigo: string; minutos: number; marca: MarcaCorreo }): string {
  const legible = `${p.codigo.slice(0, 3)} ${p.codigo.slice(3)}`;
  return correoEstudio({
    marca: p.marca,
    preheader: `Para terminar de entrar en la app de ${p.marca.estudioNombre}. Caduca en ${p.minutos} minutos.`,
    titular: 'Tu código para entrar',
    parrafos: [`Escríbelo en la app de ${p.marca.estudioNombre} para terminar de entrar. Caduca en ${p.minutos} minutos y solo sirve una vez.`],
    detalle: { filas: [{ label: 'Código', value: legible, destacado: true }] },
    nota: 'Si no estabas entrando tú, alguien tiene tu contraseña: cámbiala ya con «¿Has olvidado la contraseña?» en la pantalla de entrar. No compartas este código con nadie.',
    conPortada: false,
    firma: `El equipo de ${p.marca.estudioNombre}`,
  });
}

/**
 * Aviso a la alumna de que su estudio le ha quitado la verificación en dos pasos
 * (lo pidió ella por haber perdido la app y el correo, lib/auth/quitar-doble-factor.ts).
 * Va siempre: si no lo pidió ella, es la única forma de que se entere.
 */
export function correoDobleFactorQuitado(p: { marca: MarcaCorreo }): string {
  return correoEstudio({
    marca: p.marca,
    preheader: `${p.marca.estudioNombre} ha quitado la verificación en dos pasos de tu cuenta.`,
    titular: 'Hemos quitado la verificación en dos pasos',
    parrafos: [
      `${p.marca.estudioNombre} ha quitado la verificación en dos pasos de tu cuenta. Desde ahora entras en la app solo con tu contraseña.`,
      'Puedes volver a activarla cuando quieras en Perfil → Contraseña y verificación.',
    ],
    nota: `Si no lo has pedido tú, cambia tu contraseña ya con «¿Has olvidado la contraseña?» en la pantalla de entrar y avisa a ${p.marca.estudioNombre}.`,
    conPortada: false,
    firma: `El equipo de ${p.marca.estudioNombre}`,
  });
}
