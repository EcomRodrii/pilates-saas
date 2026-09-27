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
