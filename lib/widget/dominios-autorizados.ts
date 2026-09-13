// Lista blanca de orígenes del widget embebido (`studios.widget_dominios_autorizados`,
// lib/cors-widget.ts). La escribe solo /api/estudio/widget-dominios (PROPIETARIO);
// este módulo es la regla de formato que comparten esa ruta y la pantalla.
//
// Puro a propósito (sin Supabase ni React) para probarlo con node --test.
//
// Qué se admite: un ORIGEN exacto — `https://host[:puerto]`, sin ruta, query,
// fragmento, credenciales ni comodines. CORS compara el `Origin` literal, así
// que cualquier otra cosa o no casa nunca o autoriza algo que no se quería
// (`null` casa con iframes sandbox y `file://`; `http://` con una web sin TLS).
// Excepción: `http://localhost` y `http://127.0.0.1`, que solo alcanzan una
// página en el propio ordenador de quien prueba el widget.

export const MAX_DOMINIOS_WIDGET = 20;

const ETIQUETA_DNS = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1']);

// Convierte lo que teclea la propietaria («midominio.com», «https://midominio.com/»,
// una URL pegada con ruta) en el origen que se guardará, o null si no vale.
export function normalizarOrigenWidget(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (!v || v.length > 300 || /[*\s\\]/.test(v)) return null;

  let u: URL;
  try {
    u = new URL(v.includes('://') ? v : `https://${v}`);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;

  const host = u.hostname;
  if (HOSTS_LOCALES.has(host)) {
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  }

  if (u.protocol !== 'https:') return null;
  if (host.length > 253 || host.startsWith('[') || /^[\d.]+$/.test(host)) return null;
  const etiquetas = host.split('.');
  if (etiquetas.length < 2 || !etiquetas.every(e => ETIQUETA_DNS.test(e))) return null;
  if (/^\d+$/.test(etiquetas[etiquetas.length - 1])) return null;
  return u.origin;
}

// Lo que se GUARDA tiene que ser ya un origen normalizado: la ruta no corrige
// en silencio (eso lo hace la pantalla, a la vista), solo acepta o rechaza.
export function esOrigenWidgetValido(valor: unknown): valor is string {
  return typeof valor === 'string' && normalizarOrigenWidget(valor) === valor;
}

export type ResultadoDominiosWidget =
  | { ok: true; dominios: string[] }
  | { ok: false; error: string };

export function validarDominiosWidget(cuerpo: unknown): ResultadoDominiosWidget {
  const lista = (cuerpo as { dominios?: unknown } | null)?.dominios;
  if (!Array.isArray(lista)) return { ok: false, error: 'Falta la lista de dominios.' };
  if (lista.length > MAX_DOMINIOS_WIDGET) {
    return { ok: false, error: `Como máximo ${MAX_DOMINIOS_WIDGET} dominios autorizados.` };
  }
  const dominios: string[] = [];
  for (const d of lista) {
    if (!esOrigenWidgetValido(d)) {
      return {
        ok: false,
        error: `«${String(d).slice(0, 80)}» no es un dominio válido. Usa solo el dominio con https, p. ej. https://midominio.com`,
      };
    }
    if (!dominios.includes(d)) dominios.push(d);
  }
  return { ok: true, dominios };
}

// Texto de la línea de Actividad: qué se autorizó y qué se retiró.
export function textoCambioDominios(antes: string[], despues: string[]): string | null {
  const anadidos = despues.filter(d => !antes.includes(d));
  const quitados = antes.filter(d => !despues.includes(d));
  if (anadidos.length === 0 && quitados.length === 0) return null;
  const partes: string[] = [];
  if (anadidos.length) partes.push(`autorizado ${anadidos.join(', ')}`);
  if (quitados.length) partes.push(`retirado ${quitados.join(', ')}`);
  return `Dominios del widget: ${partes.join('; ')}`;
}
