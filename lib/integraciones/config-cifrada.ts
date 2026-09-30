// ─────────────────────────────────────────────────────────────────────────────
// Los secretos de `integraciones.config`: lo que el estudio pega de otro
// servicio para que Tentare actúe en su nombre (el token de WhatsApp, la clave
// API de Kisi y la de Mailchimp). Se cifran con el mismo esquema que los tokens
// OAuth (./cifrado-credenciales.ts); el resto de la config (remitente, id de la
// cerradura, prefijo del servidor, plantillas aprobadas…) no es secreto y se
// queda legible.
//
// Solo el servidor escribe esta tabla (PUT /api/integrations/config y el alta
// de WhatsApp por Embedded Signup), y todo lo que lee un secreto pasa por
// `descifrarConfigIntegracion`: lo vigila el test de al lado.
// ─────────────────────────────────────────────────────────────────────────────
import {
  cifrarCredencial, descifrarCredencial, estaCifrado, pideCifrarse, type ClavesCredenciales,
} from './cifrado-credenciales.ts';

/** Los campos que son un secreto, sea cual sea la integración. */
export const CAMPOS_SECRETOS: readonly string[] = ['token', 'apiKey'];

export function contextoConfigIntegracion(studioId: string, tipo: string, campo: string): string {
  return `${studioId}:integraciones:${tipo}:${campo}`;
}

function comoConfig(config: unknown): Record<string, string> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  return Object.fromEntries(Object.entries(config).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/**
 * La config que se guarda: cada secreto cifrado si hay clave. Sin clave se
 * guarda en claro y `enClaro` lo dice (quien guarda avisa). Un secreto ya
 * cifrado con la clave actual se deja como está.
 */
export function cifrarConfigIntegracion(
  studioId: string, tipo: string, config: Record<string, string>, claves: ClavesCredenciales,
): { config: Record<string, string>; enClaro: boolean } {
  const salida = { ...config };
  let enClaro = false;
  for (const campo of CAMPOS_SECRETOS) {
    const valor = salida[campo];
    if (!valor) continue;
    if (!claves.actual) { enClaro = enClaro || !estaCifrado(valor); continue; }
    if (estaCifrado(valor) && !pideCifrarse(valor, claves)) continue;
    const ctx = contextoConfigIntegracion(studioId, tipo, campo);
    const leido = descifrarCredencial(valor, ctx, claves);
    // Cifrado con una clave que ya no se tiene: no se puede recifrar, y
    // cifrar el texto cifrado sería guardar basura. Se deja como está.
    if (!leido.ok) continue;
    salida[campo] = cifrarCredencial(leido.valor, ctx, claves.actual);
  }
  return { config: salida, enClaro };
}

/**
 * La config tal y como la usa quien la lee. Un secreto que no se puede
 * descifrar NO se devuelve (ni cifrado ni vacío): el campo desaparece, y la
 * integración se comporta como sin configurar. `fallidos` lo dice para avisar.
 */
export function descifrarConfigIntegracion(
  studioId: string, tipo: string, config: unknown, claves: ClavesCredenciales,
): { config: Record<string, string>; fallidos: string[] } {
  const salida = comoConfig(config);
  const fallidos: string[] = [];
  for (const campo of CAMPOS_SECRETOS) {
    const valor = salida[campo];
    if (!valor) continue;
    const leido = descifrarCredencial(valor, contextoConfigIntegracion(studioId, tipo, campo), claves);
    if (leido.ok) salida[campo] = leido.valor;
    else { delete salida[campo]; fallidos.push(campo); }
  }
  return { config: salida, fallidos };
}

/** Si a una config guardada le queda algún secreto por cifrar con la clave actual. */
export function configPideCifrarse(config: unknown, claves: ClavesCredenciales): boolean {
  const c = comoConfig(config);
  return CAMPOS_SECRETOS.some(campo => !!c[campo] && pideCifrarse(c[campo], claves));
}
