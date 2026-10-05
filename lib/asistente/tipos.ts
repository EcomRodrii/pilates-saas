// Los tipos del asistente que comparten el servidor, el bucle y (en el PR de la
// interfaz) el navegador. Sin nombres de personas en ningún sitio: solo ids y
// referencias (`ALUMNA_3`, `EQUIPO_1`), que el navegador pinta con el nombre que
// le llega aparte (evento `referencias`).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { Rol } from '../types.ts';
import type { TablaReferencias, PersonaDelEstudio } from './referencias.ts';

export const NOMBRES_HERRAMIENTAS = [
  'resumen_del_estudio', 'que_revisar_hoy', 'contar_alumnas', 'alumnas_sin_venir', 'agenda_del_dia',
  'clases_proximas_con_huecos', 'ocupacion_por_franja', 'actividad_del_periodo', 'facturacion_del_periodo',
  'pagos_pendientes', 'bonos_por_caducar', 'datos_para_un_evento',
] as const;
export type NombreHerramienta = typeof NOMBRES_HERRAMIENTAS[number];

export interface Metrica {
  etiqueta: string;
  valor: string;
  tipo: 'eur' | 'n' | 'pct';
  comparacion?: { texto: string; tono: 'sube' | 'baja' | 'igual'; frente: string };
  href?: string;
}

export interface ClaseDelBloque {
  sesionId: string;
  hora: string;
  tipoClase: string;
  sala: string;
  /** Referencia (`EQUIPO_1`) o '' si la clase no tiene instructora. */
  instructora: string;
  ocupadas: number;
  aforo: number;
  enEspera: number;
  senal: 'PROBLEMA' | 'ATENCION' | 'OK';
  motivo: string | null;
}

export type BloqueAsistente =
  | { tipo: 'metricas'; titulo: string; nota?: string; metricas: Metrica[] }
  | { tipo: 'clases'; titulo: string; href: string; total: number; clases: ClaseDelBloque[] }
  | { tipo: 'alumnas'; titulo: string; href: string; total: number; alumnas: { ref: string; socioId: string; detalle: string }[] }
  | { tipo: 'recibos'; titulo: string; href: '/cobros'; total: number; importeTotal: string;
      recibos: { reciboId: string; alumna: string | null; importe: string; situacion: 'POR_COBRAR' | 'IMPAGADO' | 'EN_CURSO'; vence: string }[] }
  | { tipo: 'bonos'; titulo: string; href: string; total: number; bonos: { suscripcionId: string; alumna: string; plan: string; restantes: number; caduca: string }[] }
  | { tipo: 'franjas'; titulo: string; href: string; franjas: { clave: string; texto: string; tipoClase: string; ocupacion: number | null; nClases: number; enEspera: number }[] }
  | { tipo: 'revisar'; lineas: { id: string; n: number; texto: string; href: string | null; bandeja: 'decidir' | 'enMarcha' }[]; veredicto: { titulo: string; href: string } | null };
// Fase 2 (solo el tipo; nada lo emite en fase 1):
//  | { tipo: 'propuesta'; propuesta: PropuestaAccion }

/** Fase 2: una acción que el asistente PROPONE y la propietaria confirma. Solo el contrato. */
export interface PropuestaAccion {
  id: string;
  tipo: string;
  resumen: string;
  visto: Record<string, unknown>;
  expiraEn: string;
}

export interface ContextoHerramienta {
  /** service-role: la RLS no filtra. TODA consulta va con `.eq('studio_id', ctx.studioId)`. */
  admin: SupabaseClient;
  /** De `verificarSesionStaff`, nunca del modelo. */
  studioId: string;
  /** Quien pregunta (la bandeja cuenta sus seguimientos y no sus propias bajas). */
  userId: string;
  rol: Rol;
  ahora: Date;
  /** 'YYYY-MM-DD' del estudio. */
  hoy: string;
  refs: TablaReferencias;
  /** Todas las personas del estudio (las mismas con que se marca la pregunta): cualquier texto
   *  redactado que salga hacia Anthropic se seudonimiza con la lista ENTERA, no con la persona
   *  que la recomendación dice tratar — su motivo puede nombrar a otra (A4 «la primera, X…»). */
  personas: readonly PersonaDelEstudio[];
  plan: { decisiones: boolean };
}

export interface ResultadoHerramienta {
  /** Compacto, con las cifras ya formateadas y las personas como referencia. */
  paraModelo: unknown;
  /** Las tarjetas para el panel (ids y referencias, nunca nombres). */
  bloques: BloqueAsistente[];
  /** No se ha podido responder (fecha fuera de rango, lectura fallida…): va como `is_error`. */
  esError?: boolean;
}

/** Lo que se sabe de una herramienta sin ejecutarla: puro, sirve para el prompt, la caché y las guardias. */
export interface DefinicionHerramienta<I = unknown> {
  nombre: NombreHerramienta;
  /** Fase 2 añadirá 'accion' (propone, nunca ejecuta). */
  clase: 'lectura';
  descripcion: string;
  esquema: Anthropic.Tool['input_schema'];
  zod: z.ZodType<I>;
  /** Si se le OFRECE al modelo a este rol. Sale de lib/permisos-reglas.ts, nunca a mano. */
  permitida: (rol: Rol) => boolean;
  /** «Mirando la agenda del martes 6…», para la línea de estado. */
  etiqueta: (input: I, hoy: string) => string;
}

export interface Herramienta<I = unknown> extends DefinicionHerramienta<I> {
  ejecutar: (input: I, ctx: ContextoHerramienta) => Promise<ResultadoHerramienta>;
}
