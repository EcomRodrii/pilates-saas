// Lo que el formulario de contacto de /reservar (components/reservar/
// formulario-contacto.tsx) decide ANTES de hablar con el servidor. Puro, para
// `node --test`.
//
// Por qué se comprueba aquí y no solo en el servidor: enviar exige pedir un
// token al captcha, que tarda segundos y vale para una sola petición. Un
// campo vacío o un email con errata se dicen al momento, sin gastarlo.

import { EMAIL_VALIDO } from '../recursos/descargas.ts';

export type CampoObligatorio = 'nombre' | 'email' | 'mensaje';

const COMO_SE_DICE: Record<CampoObligatorio, string> = { nombre: 'tu nombre', email: 'tu email', mensaje: 'el mensaje' };

/** Los obligatorios que siguen vacíos, en el orden en que aparecen en pantalla. */
export function camposVacios(v: Record<CampoObligatorio, string>): CampoObligatorio[] {
  return (['nombre', 'email', 'mensaje'] as const).filter(c => !v[c].trim());
}

/** «Falta tu email.» / «Faltan tu nombre y el mensaje.»: qué falta, no solo que algo falla. */
export function avisoCamposVacios(faltan: CampoObligatorio[]): string | null {
  if (faltan.length === 0) return null;
  const nombres = faltan.map(c => COMO_SE_DICE[c]);
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  return `${nombres.length === 1 ? 'Falta' : 'Faltan'} ${lista}.`;
}

/** El mismo criterio que aplica el servidor (validarConsulta). */
export function emailConFormato(email: string): boolean {
  return EMAIL_VALIDO.test(email.trim());
}

export const EMAIL_CON_ERRATA = 'Escribe un email válido para que te puedan responder.';
export const PRIVACIDAD_SIN_MARCAR = 'Marca que has leído la información sobre privacidad.';

/** Lo que se comprueba al enviar, en este orden: se para en el primero que falla. */
export type PasoPendiente = 'vacios' | 'email' | 'privacidad';
export type CampoMarcable = CampoObligatorio | 'privacidad';

export interface ValoresContacto {
  nombre: string;
  email: string;
  mensaje: string;
  privacidad: boolean;
}

export interface Pendiente {
  paso: PasoPendiente;
  mensaje: string;
  /** Los que se marcan como inválidos: exactamente los que nombra el aviso. */
  campos: CampoMarcable[];
}

/**
 * Qué sigue mal en UN paso, con los valores de ahora. El formulario lo
 * recalcula al escribir: el aviso cambia con lo que se corrige y desaparece
 * cuando el paso queda bien. No salta al siguiente paso por su cuenta: avisar
 * de la errata del email mientras aún se está escribiendo sería regañar antes
 * de tiempo; eso lo dice el siguiente intento.
 */
export function pendienteEnPaso(paso: PasoPendiente, v: ValoresContacto): Pendiente | null {
  if (paso === 'vacios') {
    const faltan = camposVacios(v);
    const mensaje = avisoCamposVacios(faltan);
    return mensaje ? { paso, mensaje, campos: faltan } : null;
  }
  if (paso === 'email') return emailConFormato(v.email) ? null : { paso, mensaje: EMAIL_CON_ERRATA, campos: ['email'] };
  return v.privacidad ? null : { paso, mensaje: PRIVACIDAD_SIN_MARCAR, campos: ['privacidad'] };
}

/** Al pulsar «Enviar»: lo primero que impide enviar, o `null` si ya se puede. */
export function primerPendiente(v: ValoresContacto): Pendiente | null {
  for (const paso of ['vacios', 'email', 'privacidad'] as const) {
    const p = pendienteEnPaso(paso, v);
    if (p) return p;
  }
  return null;
}

/** Para el «Gracias, Ana»: la primera palabra, aunque venga con espacios de más. */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? '';
}

export interface ViaDeContacto {
  texto: string;
  href: string;
}

/**
 * Cómo escribir al estudio sin el formulario, ya como enlaces. El teléfono se
 * enseña tal cual lo escribió el estudio, pero el `tel:` lleva solo dígitos
 * (y el `+` inicial): con espacios o paréntesis, algunos móviles no marcan.
 */
export function viasDeContacto(email: string | null, telefono: string | null): ViaDeContacto[] {
  const vias: ViaDeContacto[] = [];
  const e = email?.trim();
  if (e) vias.push({ texto: e, href: `mailto:${e}` });
  const t = telefono?.trim();
  const digitos = t ? t.replace(/\D/g, '') : '';
  if (t && digitos) vias.push({ texto: t, href: `tel:${t.startsWith('+') ? '+' : ''}${digitos}` });
  return vias;
}
