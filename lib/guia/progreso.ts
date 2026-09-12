// ─────────────────────────────────────────────────────────────────────────────
// El estado de cada capítulo de la guía.
//
// ⚠️ **Aquí no se deriva nada.** `lib/onboarding.ts` ya decide qué está hecho, y
// lo hace a partir de datos reales del estudio (`d.numSalas > 0`,
// `!!d.stripeAccountId`), nunca de un flag. Este módulo solo reparte esos pasos
// entre capítulos y suma.
//
// El motivo de no recalcular es el de siempre en este repo: dos sitios que
// deciden lo mismo acaban diciendo cosas distintas, y aquí el síntoma sería una
// guía que marca un capítulo como pendiente mientras el checklist del panel lo
// da por hecho. Si mañana cambia cómo se sabe que hay salas, cambia en un sitio.
//
// «Leído» NO es progreso y no vive aquí: leer un capítulo no configura nada, y
// contarlo como avance es exactamente el checklist falso que el encargo pedía
// evitar. Eso se guarda por navegador, junto al resto de preferencias de vista.
// ─────────────────────────────────────────────────────────────────────────────
import { CAPITULOS, NIVELES, type CapituloGuia, type NivelGuia } from './curriculo.ts';
import type { CategoriaOnboarding, PasoOnboarding } from '../onboarding.ts';

export type EstadoCapitulo = 'sin-pasos' | 'pendiente' | 'a-medias' | 'hecho';

export interface CapituloConEstado {
  capitulo: CapituloGuia;
  /** Los pasos reales que enseña, resueltos contra el checklist. */
  pasos: PasoOnboarding[];
  hechos: number;
  total: number;
  estado: EstadoCapitulo;
}

export interface ProgresoGuia {
  capitulos: CapituloConEstado[];
  /** Solo los capítulos «Para empezar»: el camino hasta la primera reserva. */
  esencialHechos: number;
  esencialTotal: number;
  esencialPct: number;
  /**
   * El siguiente capítulo con algo pendiente, EN ORDEN. No el más corto ni el
   * más fácil: los capítulos están puestos en el orden en que se desbloquean
   * (sin salas no hay clases, sin clases no hay reservas), así que saltarse uno
   * deja a la propietaria trabada más adelante sin entender por qué.
   */
  siguiente: CapituloConEstado | null;
  /** El primer paso concreto que le falta dentro de ese capítulo. */
  siguientePaso: PasoOnboarding | null;
}

/** Aplana las categorías del checklist en un índice `id de paso → paso`. */
function indicePasos(categorias: CategoriaOnboarding[]): Map<string, PasoOnboarding> {
  const m = new Map<string, PasoOnboarding>();
  for (const cat of categorias) for (const paso of cat.pasos) m.set(paso.id, paso);
  return m;
}

export function calcularProgresoGuia(categorias: CategoriaOnboarding[]): ProgresoGuia {
  const indice = indicePasos(categorias);

  const capitulos: CapituloConEstado[] = CAPITULOS.map(capitulo => {
    // Un id que no resuelve se ignora en vez de romper la pantalla: si alguien
    // renombra un paso en onboarding.ts, la guía se queda corta de un tick, no
    // en blanco. El test de cobertura es quien lo caza en CI.
    const pasos = capitulo.pasos
      .map(id => indice.get(id))
      .filter((p): p is PasoOnboarding => p !== undefined);
    const hechos = pasos.filter(p => p.done).length;
    const total = pasos.length;
    const estado: EstadoCapitulo =
      total === 0 ? 'sin-pasos'
      : hechos === total ? 'hecho'
      : hechos === 0 ? 'pendiente'
      : 'a-medias';
    return { capitulo, pasos, hechos, total, estado };
  });

  const esenciales = capitulos.filter(c => c.capitulo.nivel === 'esencial');
  const esencialHechos = esenciales.reduce((n, c) => n + c.hechos, 0);
  const esencialTotal = esenciales.reduce((n, c) => n + c.total, 0);

  // El siguiente se busca en TODA la guía, no solo en lo esencial: cuando ya
  // está todo lo de empezar, sigue habiendo un siguiente sensato que ofrecer.
  const siguiente = capitulos.find(c => c.estado === 'pendiente' || c.estado === 'a-medias') ?? null;

  return {
    capitulos,
    esencialHechos,
    esencialTotal,
    esencialPct: esencialTotal === 0 ? 0 : Math.round((esencialHechos / esencialTotal) * 100),
    siguiente,
    siguientePaso: siguiente?.pasos.find(p => !p.done) ?? null,
  };
}

/** Los capítulos de un nivel, ya con su estado. Para pintar la portada por bloques. */
export function porNivel(progreso: ProgresoGuia): { nivel: NivelGuia; capitulos: CapituloConEstado[] }[] {
  return NIVELES.map(nivel => ({
    nivel,
    capitulos: progreso.capitulos.filter(c => c.capitulo.nivel === nivel),
  }));
}
