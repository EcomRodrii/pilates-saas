// Funcionalidades que entran APAGADAS y el fundador enciende estudio a estudio,
// cada una con su variable de entorno (formato de `ASISTENTE_IA`):
//
//   on                    → encendida para todos
//   estudios:<id1>,<id2>  → solo en esos
//   cualquier otra cosa   → apagada (lo de serie)
//
// Un catálogo CERRADO: la próxima funcionalidad añade una línea aquí, no una
// ruta nueva. Se lee SOLO en el servidor (GET /api/estudio/interruptores): ni
// las variables ni los ids de estudio viajan al navegador. ⚠️ Cambiar una
// variable en Vercel no llega a producción sin un despliegue de código.
// Puro, sin `@/`.

// El formato y su lectura son los de `encendidaPara` (lib/interruptor-por-estudio.ts):
// uno solo para todos los interruptores. Este catálogo es el de los que tiene
// que conocer el NAVEGADOR (por eso pasan por un endpoint); los que solo mira
// el servidor viven allí.
import { encendidaPara } from '../interruptor-por-estudio.ts';

export const INTERRUPTORES = {
  /** Filtros y columnas nuevos de Clientas (P2.8). */
  filtrosClientas: 'CLIENTAS_FILTROS',
  /** Pegar desde una hoja en el importador de Clientas (P3.16). */
  importarPegando: 'IMPORTAR_PEGANDO',
  /** «Avisar por WhatsApp» a quien está en el equipo sin acceso (P3.14). */
  invitarWhatsApp: 'EQUIPO_INVITAR_WHATSAPP',
  /** «Desde una foto o un texto» en Calendario › Importar (P2.1). */
  horarioDesdeImagen: 'HORARIO_DESDE_IMAGEN',
  /** Niveles con ritmo y equivalencias en clases, en Motivación (P3.8). */
  nivelesConRitmo: 'GAMIFICACION_NIVELES_RITMO',
  /** Qué se ve de cada alumna en la lista de una clase (P3.11). */
  tarjetaClase: 'TARJETA_CLASE',
  /**
   * El panel rehecho al nivel de Bonsai (14-oct-2026): la guía en tres capas
   * (Primeros pasos, «Cómo funciona», ayuda «?»), las piezas base y las
   * pantallas que se van rehaciendo. Primero solo en el estudio de prueba del
   * fundador; a todos cuando él dé el sí.
   */
  panelNuevo: 'PANEL_NUEVO',
  /**
   * «Pedir mi app» (Apariencia de tu app → app propia en la App Store, 15-oct-2026). Apagado de
   * serie: sin él la sección no se pinta y la ruta contesta 404. Se enciende con el piloto de
   * «marta» y a todos cuando el fundador dé el sí.
   */
  pedirApp: 'APP_PROPIA_PEDIR',
} as const;

export type Interruptor = keyof typeof INTERRUPTORES;

export function interruptoresDe(studioId: string, entorno: Record<string, string | undefined>): Record<Interruptor, boolean> {
  return Object.fromEntries(
    (Object.keys(INTERRUPTORES) as Interruptor[]).map(k => [k, encendidaPara(entorno[INTERRUPTORES[k]], studioId)]),
  ) as Record<Interruptor, boolean>;
}

/**
 * Lo que contesta el endpoint, o `null` si el navegador pregunta por una sede
 * que no es la de la sesión (se cambió en otra pestaña o en otro dispositivo
 * justo antes). Con `null` la ruta contesta 409 y el navegador no recuerda
 * nada: ni el «sí» de una sede bajo la otra, ni un «no» falso de 30 minutos.
 */
export function interruptoresPara(
  studioDeLaSesion: string,
  studioPedido: string | null,
  entorno: Record<string, string | undefined>,
): Record<Interruptor, boolean> | null {
  if (studioPedido !== null && studioPedido !== studioDeLaSesion) return null;
  return interruptoresDe(studioDeLaSesion, entorno);
}
