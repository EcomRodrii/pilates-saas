// ─────────────────────────────────────────────────────────────────────────────
// Migración Mágica · ANALIZADOR (server-only) — el clasificador determinista de
// lib/migracion/clasificador.ts + el fallback de IA cuando aquel no llega.
// Vive aparte porque importa el SDK de Anthropic (no puede ir a un bundle de
// cliente); toda la lógica pura está en clasificador.ts, que la demo pública
// corre en el navegador.
//
// Principio de diseño (el listón es 30/30 propietarias satisfechas): la IA
// PROPONE, nunca ejecuta. Solo ve cabeceras + una muestra y devuelve
// entidad+mapeo; el mapeo se aplica DETERMINISTA en código sobre todas las
// filas. Sin clave o sin llegar al listón → sin clasificar (decide el humano).
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import {
  ENTIDADES, UMBRAL_CONFIANZA,
  evaluarMapeo, construirAnalisis, sinClasificar,
  clasificarArchivoDeterminista, avisosGlobalesYOrden,
  type EntidadMigracion, type ArchivoEntrada, type ArchivoAnalizado,
  type PlanMigracion, type ContextoEstudio,
} from './clasificador.ts';

// Re-export de los tipos para no romper a los importadores existentes.
export type { EntidadMigracion, ArchivoEntrada, ArchivoAnalizado, PlanMigracion, ContextoEstudio } from './clasificador.ts';
export { ORDEN_EJECUCION } from './clasificador.ts';

// ── Fallback IA: clasificar + mapear con Claude ──────────────────────────────
// Mismo modelo y patrón falla-suave que el resto del proyecto (automatizaciones):
// si no hay clave o no parsea → null, sin romper.
async function clasificarConIA(
  nombre: string, headers: string[], muestra: string[][],
): Promise<{ entidad: EntidadMigracion; mapeo: Record<string, number> } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const anthropic = new Anthropic();
    const esquemas = (Object.entries(ENTIDADES) as [EntidadMigracion, typeof ENTIDADES[EntidadMigracion]][])
      .map(([id, def]) => `- ${id}: ${def.campos.map(c => `${c.campo}${c.obligatorio ? '*' : ''} (${c.etiqueta})`).join(', ')}`)
      .join('\n');
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:
        'Clasificas exports de software de gestión de estudios de pilates/fitness (Timp, Momence, Eversports, bsport, Mindbody, Excel casero...) para migrarlos. ' +
        'Devuelves SOLO un JSON: {"entidad": "<socias|membresias|clases|reservas|citas|ninguna>", "mapeo": {"<campo>": <índice de columna 0-based>}}. ' +
        'Solo incluye en el mapeo campos que EXISTAN claramente en las columnas; nunca inventes. Si el archivo no encaja con ninguna entidad, entidad="ninguna". ' +
        'Los campos con * son obligatorios: si no puedes mapearlos, la entidad no es válida.\n\nEntidades y campos:\n' + esquemas,
      messages: [{
        role: 'user',
        content:
          `Archivo: ${nombre}\nColumnas (índice: nombre):\n` +
          headers.map((h, i) => `${i}: ${h}`).join('\n') +
          `\n\nPrimeras filas:\n` +
          muestra.map(f => f.join(' | ')).join('\n'),
      }],
    });
    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json) as { entidad?: string; mapeo?: Record<string, number> };
    if (!parsed.entidad || parsed.entidad === 'ninguna' || !(parsed.entidad in ENTIDADES) || !parsed.mapeo) return null;
    const entidad = parsed.entidad as EntidadMigracion;
    const mapeo: Record<string, number> = {};
    for (const c of ENTIDADES[entidad].campos) {
      const idx = parsed.mapeo[c.campo];
      mapeo[c.campo] = Number.isInteger(idx) && idx >= 0 && idx < headers.length ? idx : -1;
    }
    return { entidad, mapeo };
  } catch {
    return null;
  }
}

export async function analizarArchivos(archivos: ArchivoEntrada[], ctx: ContextoEstudio): Promise<PlanMigracion> {
  const resultados: ArchivoAnalizado[] = [];

  for (const archivo of archivos) {
    const det = clasificarArchivoDeterminista(archivo, ctx);
    if (det.tipo === 'ok' || det.tipo === 'vacio') {
      resultados.push(det.analisis);
      continue;
    }

    // El determinista no llegó: probar IA (clasifica + mapea; se aplica en código).
    const { headers, rows, mejor, motivoSinClasificar } = det;
    const ia = await clasificarConIA(archivo.nombre, headers, rows.slice(0, 10));
    if (ia) {
      const def = ENTIDADES[ia.entidad];
      const ev = evaluarMapeo(def, headers, rows, ia.mapeo);
      if (ev.obligatoriosCubiertos && ev.tasaOk > (mejor?.tasaOk ?? 0) && ev.tasaOk >= UMBRAL_CONFIANZA) {
        resultados.push(construirAnalisis(archivo.nombre, headers, rows, ia.entidad, 'ia', ia.mapeo, ev.validadas, ctx));
        continue;
      }
      // Propuesta de baja confianza: se enseña marcada, nunca como plan listo.
      if (ev.obligatoriosCubiertos && ev.tasaOk > 0) {
        const analisis = construirAnalisis(archivo.nombre, headers, rows, ia.entidad, 'ia', ia.mapeo, ev.validadas, ctx);
        analisis.avisos.unshift(`Solo ${Math.round(ev.tasaOk * 100)}% de las filas pasan la validación con este mapeo — revísalo a mano antes de ejecutar.`);
        resultados.push(analisis);
        continue;
      }
    }

    resultados.push(sinClasificar(archivo.nombre, headers, rows.length, motivoSinClasificar));
  }

  return { archivos: resultados, ...avisosGlobalesYOrden(resultados) };
}
