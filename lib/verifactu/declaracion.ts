// Veri*Factu — la declaración responsable: leerla, y suscribirla.
//
// SOLO SERVIDOR (service-role). Los datos del productor salen de la
// configuración del servidor (`productorDeEntorno`), nunca del cliente ni de un
// literal del repo. Lo que se suscribe se guarda tal cual en
// `verifactu_declaraciones_responsables` (solo se añaden filas).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SIF, apartadosDeclaracion, textoDeclaracion, productorDeEntorno, fechaSuscripcionValida,
  TITULO_DECLARACION, type ApartadoDeclaracion,
} from './sif.ts';
import { sha256Texto } from './envio.ts';

export interface FilaDeclaracion {
  id: string;
  version_sif: string;
  texto: string;
  texto_sha256: string;
  fecha_suscripcion: string;
  lugar_suscripcion: string;
  suscrita_en: string;
}

export interface EstadoDeclaracion {
  titulo: string;
  version: string;
  /** La suscrita para la versión actual, si la hay. */
  suscrita: { fecha: string; lugar: string; suscritaEn: string; sha256: string } | null;
  /** Apartados a mostrar: los de la suscrita si la hay; si no, el borrador. */
  apartados: ApartadoDeclaracion[];
  /** Qué falta para poder suscribirla (vacío si está completa). */
  falta: string[];
}

type Env = Record<string, string | undefined>;

/** La declaración suscrita más reciente para la versión ACTUAL del software. */
export async function declaracionVigente(admin: SupabaseClient, version: string = SIF.version): Promise<FilaDeclaracion | null> {
  const { data } = await admin.from('verifactu_declaraciones_responsables')
    .select('id, version_sif, texto, texto_sha256, fecha_suscripcion, lugar_suscripcion, suscrita_en')
    .eq('version_sif', version)
    .order('suscrita_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FilaDeclaracion | null) ?? null;
}

export async function estadoDeclaracion(admin: SupabaseClient, env: Env = process.env): Promise<EstadoDeclaracion> {
  const vigente = await declaracionVigente(admin);
  const { productor, falta } = productorDeEntorno(env);
  if (vigente) {
    return {
      titulo: TITULO_DECLARACION,
      version: SIF.version,
      suscrita: { fecha: vigente.fecha_suscripcion, lugar: vigente.lugar_suscripcion, suscritaEn: vigente.suscrita_en, sha256: vigente.texto_sha256 },
      // Se reconstruye desde el texto guardado: lo que se enseña es lo suscrito,
      // no lo que diga hoy la configuración.
      apartados: apartadosDesdeTexto(vigente.texto),
      falta: [],
    };
  }
  return {
    titulo: TITULO_DECLARACION,
    version: SIF.version,
    suscrita: null,
    apartados: apartadosDeclaracion(productor, null),
    falta: [...falta, 'fecha y lugar de suscripción (se fijan al suscribirla desde /interno/verifactu)'],
  };
}

/** Parte el texto guardado en sus apartados (inverso de `textoDeclaracion`). */
export function apartadosDesdeTexto(texto: string): ApartadoDeclaracion[] {
  const bloques = texto.split('\n\n').slice(1); // fuera el título
  return bloques.filter(b => b.trim()).map(b => {
    const m = /^(1\.[a-l])\) ([\s\S]*?)(?::\n([\s\S]*))?$/.exec(b.trim());
    if (!m) return { letra: '', etiqueta: b.trim(), valor: '' };
    return { letra: m[1], etiqueta: m[2], valor: m[3] ?? '' };
  });
}

export class DeclaracionIncompletaError extends Error {
  readonly falta: string[];
  constructor(falta: string[]) {
    super(`No se puede suscribir la declaración: falta ${falta.join('; ')}`);
    this.name = 'DeclaracionIncompletaError';
    this.falta = falta;
  }
}

/**
 * Suscribe la declaración de la versión actual con la fecha y el lugar que da
 * el productor. Idempotente por texto: suscribir dos veces lo mismo devuelve la
 * misma fila.
 */
export async function suscribirDeclaracion(
  admin: SupabaseClient,
  p: { fecha: string; lugar: string; suscritaPor: string | null },
  env: Env = process.env,
): Promise<FilaDeclaracion> {
  const { productor, falta } = productorDeEntorno(env);
  const faltan = [...falta];
  if (!fechaSuscripcionValida(p.fecha)) faltan.push('una fecha de suscripción válida (dd-mm-aaaa)');
  const lugar = p.lugar.trim();
  if (!lugar || !lugar.includes(',')) faltan.push('el lugar como «Localidad, País» (art. 15.1.l)');
  if (faltan.length > 0 || !productor) throw new DeclaracionIncompletaError(faltan);

  const texto = textoDeclaracion(productor, { fecha: p.fecha, lugar });
  const sha = sha256Texto(texto);
  const { data: existente } = await admin.from('verifactu_declaraciones_responsables')
    .select('id, version_sif, texto, texto_sha256, fecha_suscripcion, lugar_suscripcion, suscrita_en')
    .eq('version_sif', SIF.version).eq('texto_sha256', sha).maybeSingle();
  if (existente) return existente as FilaDeclaracion;

  const { data, error } = await admin.from('verifactu_declaraciones_responsables').insert({
    version_sif: SIF.version, id_sif: SIF.id, texto, texto_sha256: sha,
    productor_nombre: productor.nombre, productor_nif: productor.nif, productor_direccion: productor.direccion,
    fecha_suscripcion: p.fecha, lugar_suscripcion: lugar, suscrita_por: p.suscritaPor,
  }).select('id, version_sif, texto, texto_sha256, fecha_suscripcion, lugar_suscripcion, suscrita_en').single();
  if (error || !data) throw new Error(`No se pudo guardar la declaración: ${error?.message ?? 'sin respuesta'}`);
  return data as FilaDeclaracion;
}
