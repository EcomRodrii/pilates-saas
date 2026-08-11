// Autoguardado del borrador del editor.
//
// El agujero que cierra: hoy la ÚNICA forma de que una edición llegue al
// servidor es pulsar **Publicar**, que guarda y publica de una vez. De ahí
// salen dos problemas, y el segundo es peor que el primero:
//
//  1. Cerrar la pestaña a medio editar pierde todo lo hecho.
//  2. Para no perderlo hay que PUBLICAR — o sea, enseñárselo a las socias
//     antes de estar lista. El borrador deja de ser un borrador.
//
// Este módulo es la parte pura: decidir QUÉ hay que guardar y en qué estado
// está el guardado. La fontanería (debounce, reintento, `beforeunload`) vive
// en el hook, que es donde puede usar temporizadores.

import { PANTALLA_IDS, type PantallaId, type BloqueHome } from '../portal-home-bloques.ts';

export type EstadoGuardado =
  | { tipo: 'limpio' }
  /** Hay cambios sin mandar todavía (dentro de la ventana de espera). */
  | { tipo: 'pendiente' }
  | { tipo: 'guardando' }
  | { tipo: 'guardado'; en: number }
  /** Falló. `intentos` sirve para espaciar los reintentos. */
  | { tipo: 'error'; intentos: number }
  /**
   * La sesión caducó. Estado APARTE de `error` porque pide otra cosa: aquí
   * reintentar no arregla nada —el servidor va a seguir diciendo 401— y lo
   * único que sirve es volver a entrar. Mezclarlo con `error` dejaba a la
   * propietaria editando media hora bajo un «se sigue intentando» que era
   * mentira.
   */
  | { tipo: 'sesion' };

export type PorPantalla = Record<PantallaId, BloqueHome[]>;

/**
 * Qué pantallas cambiaron entre dos instantáneas.
 *
 * Compara por IDENTIDAD, no por contenido: todas las mutaciones del editor
 * construyen arrays nuevos (`map`, `filter`, spread), así que una referencia
 * distinta es un cambio real y una igual no lo es. Comparar por contenido
 * costaría un `JSON.stringify` de las tres pantallas en cada pulsación, para
 * responder lo mismo.
 */
export function pantallasCambiadas(anterior: PorPantalla, actual: PorPantalla): PantallaId[] {
  return PANTALLA_IDS.filter((p) => anterior[p] !== actual[p]);
}

/**
 * Cuánto esperar antes de reintentar tras un fallo, en milisegundos.
 *
 * Sube rápido y se queda en un minuto: si el servidor está caído, insistir
 * cada segundo no lo arregla y sí llena el registro. Y **nunca deja de
 * reintentar**: quien tiene media pantalla editada sin guardar prefiere que
 * siga intentándolo en segundo plano a que se rinda en silencio.
 */
export function esperaReintento(intentos: number): number {
  const escalones = [2_000, 5_000, 15_000, 30_000, 60_000];
  return escalones[Math.min(intentos, escalones.length - 1)];
}

/**
 * El texto que ve la propietaria. Es lo único que le dice si su trabajo está
 * a salvo, así que **nunca miente por optimismo**: mientras haya algo sin
 * mandar dice que lo hay.
 */
export function textoEstado(estado: EstadoGuardado, ahora: number): string {
  switch (estado.tipo) {
    case 'limpio': return '';
    case 'pendiente': return 'Sin guardar…';
    case 'guardando': return 'Guardando…';
    case 'error': return 'No se ha podido guardar — se sigue intentando';
    case 'sesion': return 'Tu sesión ha caducado — vuelve a entrar para guardar';
    case 'guardado': {
      const segundos = Math.round((ahora - estado.en) / 1000);
      if (segundos < 5) return 'Guardado';
      if (segundos < 60) return `Guardado hace ${segundos} s`;
      const minutos = Math.round(segundos / 60);
      return `Guardado hace ${minutos} min`;
    }
  }
}

/**
 * Si hay que avisar antes de cerrar la pestaña.
 *
 * Solo cuando hay algo que de verdad se perdería. Un `beforeunload` que salta
 * siempre se convierte en un diálogo que la gente aprende a ignorar, y
 * entonces no protege de nada.
 */
export function avisarAlSalir(estado: EstadoGuardado): boolean {
  // `sesion` incluida: es justo cuando MÁS hay que perder — nada de lo
  // editado ha llegado al servidor y cerrar la pestaña lo tira todo.
  return estado.tipo === 'pendiente' || estado.tipo === 'guardando'
    || estado.tipo === 'error' || estado.tipo === 'sesion';
}

/**
 * El estado que se enseña cuando hay DOS autoguardados a la vez (los bloques y
 * los ajustes del tema) y un solo hueco en la barra para contarlo.
 *
 * ⚠️ Gana el que tenga peores noticias, nunca el más reciente. Un «Guardado»
 * del tema tapando un error de los bloques le diría a la propietaria que su
 * trabajo está a salvo cuando la mitad no lo está — y ese aviso es lo ÚNICO
 * que la haría parar y volver a entrar.
 *
 * El orden no es alfabético ni casual: `sesion` va por delante de `error`
 * porque pide algo distinto (volver a entrar, no esperar), y `guardado` cede
 * ante cualquier cosa en curso porque decir «Guardado» mientras algo vuela es
 * exactamente la mentira que hace cerrar la pestaña.
 */
const URGENCIA: Record<EstadoGuardado['tipo'], number> = {
  sesion: 5, error: 4, guardando: 3, pendiente: 2, guardado: 1, limpio: 0,
};

export function peorEstado(a: EstadoGuardado, b: EstadoGuardado): EstadoGuardado {
  if (URGENCIA[b.tipo] > URGENCIA[a.tipo]) return b;
  // Empate entre dos `guardado`: se queda el MÁS ANTIGUO. «Guardado hace 3
  // minutos» es verdad para las dos mitades; «hace 2 segundos» solo para una.
  if (a.tipo === 'guardado' && b.tipo === 'guardado') return a.en <= b.en ? a : b;
  return a;
}
