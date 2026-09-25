// Las respuestas de TODAS las alumnas a las preguntas del estudio, vistas juntas.
//
// Hasta ahora solo se veían ficha a ficha («Datos adicionales»). Con las
// preguntas en la app (#2313) cada estudio junta decenas de respuestas, y lo que
// necesita es verlas de un vistazo: quién ha contestado, qué contestó y cómo se
// reparten. Pantalla: /clientas/respuestas.
//
// Pura y sin dependencias de React: la pantalla solo pinta, y esto se prueba
// con `node --test`. Mismo criterio de «pendiente» que la app y el servidor
// (`preguntasPendientes`): así «Le falta» aquí es exactamente lo que la app le
// pedirá al entrar.

import { preguntasPendientes, tieneRespuesta, type PreguntaAlta } from './preguntas-alta.ts';

export interface SociaConRespuestas {
  id: string;
  nombre: string;
  apellidos: string;
  camposExtra?: Record<string, unknown> | null;
}

export interface FilaRespuestas {
  id: string;
  nombre: string;
  /** Valor crudo por id de pregunta (undefined = nunca se le preguntó). */
  valores: Record<string, unknown>;
  /** Cuántas le faltan con la regla de la app (obligatoria vacía o nunca preguntada). */
  pendientes: number;
  /** Cuántas tiene contestadas de verdad (una opcional en blanco no cuenta). */
  contestadas: number;
}

export function filasRespuestas(preguntas: PreguntaAlta[], socias: SociaConRespuestas[]): FilaRespuestas[] {
  return socias.map((s) => {
    const extra = s.camposExtra ?? {};
    const valores: Record<string, unknown> = {};
    for (const p of preguntas) valores[p.id] = extra[p.id];
    return {
      id: s.id,
      nombre: `${s.nombre} ${s.apellidos}`.trim(),
      valores,
      pendientes: preguntasPendientes(preguntas, extra).length,
      contestadas: preguntas.filter((p) => tieneRespuesta(extra[p.id])).length,
    };
  });
}

export interface ResumenPregunta {
  id: string;
  /** Cuántas la han contestado (con algo). */
  contestadas: number;
  /** Para listas y sí/no: cuántas eligieron cada opción, en el orden del estudio. */
  reparto?: { opcion: string; n: number }[];
  /** Para números: la media y el rango. */
  numeros?: { media: number; min: number; max: number };
}

function aNumero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function resumenPreguntas(preguntas: PreguntaAlta[], filas: FilaRespuestas[]): ResumenPregunta[] {
  return preguntas.map((p) => {
    const valores = filas.map((f) => f.valores[p.id]).filter(tieneRespuesta);
    const r: ResumenPregunta = { id: p.id, contestadas: valores.length };
    if (p.tipo === 'seleccion') {
      // Las opciones que ya no existen (el estudio las cambió) se cuentan aparte
      // en «Otras»: esconderlas haría que las cifras no sumaran.
      const conocidas = p.opciones.map((opcion) => ({ opcion, n: valores.filter((v) => v === opcion).length }));
      const otras = valores.filter((v) => !p.opciones.includes(v as string)).length;
      r.reparto = otras > 0 ? [...conocidas, { opcion: 'Otras', n: otras }] : conocidas;
    } else if (p.tipo === 'booleano') {
      r.reparto = [
        { opcion: 'Sí', n: valores.filter((v) => v === true).length },
        { opcion: 'No', n: valores.filter((v) => v === false).length },
      ];
    } else if (p.tipo === 'numero') {
      const ns = valores.map(aNumero).filter((n): n is number => n !== null);
      if (ns.length) {
        const media = ns.reduce((a, b) => a + b, 0) / ns.length;
        r.numeros = { media: Math.round(media * 10) / 10, min: Math.min(...ns), max: Math.max(...ns) };
      }
    }
    return r;
  });
}

/** Una respuesta tal y como se lee: «Sí», «8», «12/03/2026», «—». */
export function textoRespuesta(p: PreguntaAlta, v: unknown): string {
  if (!tieneRespuesta(v)) return '—';
  if (p.tipo === 'booleano') return v === true ? 'Sí' : v === false ? 'No' : String(v);
  if (p.tipo === 'numero') {
    const n = aNumero(v);
    return n === null ? String(v) : n.toLocaleString('es-ES');
  }
  if (p.tipo === 'fecha' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split('-');
    return `${d}/${m}/${a}`;
  }
  return String(v);
}

/**
 * Una celda de CSV que Excel no pueda ejecutar.
 *
 * ⚠️ Las respuestas las escribe la alumna, y una celda que empieza por `=`, `+`,
 * `-`, `@` o un tabulador la abre Excel como FÓRMULA («inyección de CSV»): la
 * propietaria abriría su export y ejecutaría lo que alguien escribió en la app.
 * Se neutraliza anteponiendo un apóstrofo, que Excel no enseña.
 */
export function celdaSegura(v: string): string {
  const neutra = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /["\n\r;]/.test(neutra) ? `"${neutra.replace(/"/g, '""')}"` : neutra;
}

/**
 * El CSV para descargar. Solo nombre y respuestas: sin email ni teléfono, que no
 * hacen falta para lo que se exporta y así el archivo lleva los datos justos.
 * Separado por `;`, que es lo que abre bien un Excel en español.
 */
export function csvRespuestas(preguntas: PreguntaAlta[], filas: FilaRespuestas[]): string {
  const cabecera = ['Alumna', ...preguntas.map((p) => p.etiqueta), 'Estado'];
  const lineas = filas.map((f) => [
    f.nombre,
    ...preguntas.map((p) => textoRespuesta(p, f.valores[p.id])),
    f.pendientes === 0 ? 'Completa' : `Le falta${f.pendientes === 1 ? '' : 'n'} ${f.pendientes}`,
  ]);
  return [cabecera, ...lineas].map((l) => l.map(celdaSegura).join(';')).join('\r\n');
}
