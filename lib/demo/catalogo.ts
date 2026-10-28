// El catálogo de lo que la demo SABE demostrar. Es la única puerta entre lo que
// propone el modelo de IA y lo que se ejecuta.
//
// Reglas, y por qué:
//   · El modelo propone `{ escenario, parametros }` y nada más. Lo demás (pasos,
//     módulos, reglas, comprobaciones) lo saca el motor de este catálogo: el
//     modelo no puede inventar un paso, una regla ni una capacidad.
//   · Cada escenario valida sus parámetros con un esquema estricto
//     (`z.strictObject`): una clave de más o un valor fuera de rango se rechaza
//     entero, no se «arregla».
//   · Nada de SQL, código ni herramientas: el motor solo llama a funciones puras
//     que ya usa el producto.
//   · Lo que no está aquí no se demuestra: se dice y se ofrece una alternativa.
import type { z } from 'zod';
import type { DemoGenerada } from './modelo.ts';
import { CONTEXTO_POR_DEFECTO, type ContextoDemo } from './centros.ts';
import * as caducidadBono from './escenarios/caducidad-bono.ts';
import * as ausenciaRecuperacion from './escenarios/ausencia-recuperacion.ts';
import * as ordenConsumo from './escenarios/orden-consumo.ts';

export interface EntradaCatalogo {
  id: string;
  titulo: string;
  /** Qué demuestra, en una frase (se le enseña a la persona y se le da al modelo). */
  descripcion: string;
  /** Qué parámetros acepta y qué significan (lo lee el modelo). */
  guiaParametros: string;
  esquema: z.ZodType<unknown>;
  generar: (parametros: never, contexto?: ContextoDemo) => DemoGenerada;
}

export const CATALOGO = {
  caducidad_bono: {
    id: 'caducidad_bono',
    titulo: 'Caducidad de un bono y ausencia de la alumna',
    descripcion: 'Qué pasa con las sesiones de un bono cuando la alumna avisa de que no va y el bono llega a su fecha de fin.',
    guiaParametros: [
      'sesionesTotales (1-20): sesiones del bono.',
      'restantesAntesDeReservar (1-20, ≤ sesionesTotales): sesiones que le quedan antes de reservar la clase.',
      'caducaDia (lunes…domingo, sin tildes): el día en que termina la vigencia del bono.',
      'diaClase (lunes…domingo, sin tildes, no posterior a caducaDia): día de la clase a la que avisa de que no va.',
      'avisoHorasAntes (1-72): con cuántas horas de antelación avisa.',
      'ventanaCancelacionHoras (0-48): plazo del estudio para cancelar sin perder la sesión; 0 = sin plazo.',
      'devolverEnTardia (true/false): si el estudio devuelve la sesión aunque se avise tarde.',
    ].join('\n'),
    esquema: caducidadBono.parametros,
    generar: caducidadBono.generar,
  },
  ausencia_recuperacion: {
    id: 'ausencia_recuperacion',
    titulo: 'Ausencia avisada y recuperación semanal',
    descripcion: 'Si una alumna con límite semanal gana una recuperación al avisar de que no va, y cómo cambia con «la semana es la ventana».',
    guiaParametros: [
      'limiteSemanal (1-5): clases por semana de su cuota.',
      'clasesReservadas (1-5, ≤ limiteSemanal): clases que reservó esa semana.',
      'clasesCanceladas (1-5, ≤ clasesReservadas): cuántas cancela.',
      'avisoHorasAntes (1-72) y ventanaCancelacionHoras (0-48): igual que en el otro escenario.',
      'vuelveAReservarLaMisma (true/false): si luego vuelve a apuntarse a una clase que canceló.',
      'repartoAutomatico (true/false): «dar recuperaciones solas al cerrar la semana».',
      'soloEnLaSemana (true/false): «la semana es la ventana»: sin recuperaciones al cancelar.',
    ].join('\n'),
    esquema: ausenciaRecuperacion.parametros,
    generar: ausenciaRecuperacion.generar,
  },
  orden_consumo_bonos: {
    id: 'orden_consumo_bonos',
    titulo: 'De qué bono se descuenta la sesión',
    descripcion: 'Qué bono gasta Tentare cuando una alumna tiene varios y reserva una clase (y qué pasa si tiene cuota mensual).',
    guiaParametros: [
      'bonos (2-3): cada uno {alcance: "todas"|"solo_esta_clase"|"solo_otra_clase", caducaEnDias: 0-120 o null si no caduca, restantes: 0-20}.',
      'tieneCuotaMensualQueCubre (true/false): si además tiene una cuota mensual que cubre la clase.',
    ].join('\n'),
    esquema: ordenConsumo.parametros,
    generar: ordenConsumo.generar,
  },
} as const satisfies Record<string, EntradaCatalogo>;

export type IdEscenario = keyof typeof CATALOGO;
export const IDS_ESCENARIO = Object.keys(CATALOGO) as IdEscenario[];

export function esIdEscenario(x: unknown): x is IdEscenario {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(CATALOGO, x);
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/**
 * De una propuesta del modelo a una demo ejecutable. Valida el escenario contra
 * el catálogo y los parámetros contra su esquema; nunca ejecuta nada que no sea
 * una función del catálogo.
 */
export function construirDemo(
  escenario: unknown, parametros: unknown, contexto: ContextoDemo = CONTEXTO_POR_DEFECTO,
): Resultado<DemoGenerada> {
  if (!esIdEscenario(escenario)) return { ok: false, motivo: 'escenario-no-soportado' };
  const entrada = CATALOGO[escenario] as unknown as EntradaCatalogo;
  const valido = entrada.esquema.safeParse(parametros ?? {});
  if (!valido.success) {
    const primero = valido.error.issues[0];
    return { ok: false, motivo: `parametros-invalidos:${primero?.path.join('.') || 'raiz'}` };
  }
  try {
    return { ok: true, valor: (entrada.generar as (p: unknown, c: ContextoDemo) => DemoGenerada)(valido.data, contexto) };
  } catch {
    return { ok: false, motivo: 'fallo-del-motor' };
  }
}

/** La demo de ejemplo de cada escenario (parámetros por defecto): lo que se ofrece sin IA. */
export function demoPorDefecto(escenario: IdEscenario, contexto: ContextoDemo = CONTEXTO_POR_DEFECTO): DemoGenerada {
  const r = construirDemo(escenario, {}, contexto);
  if (!r.ok) throw new Error(`El escenario ${escenario} no se genera con sus valores por defecto: ${r.motivo}`);
  return r.valor;
}
