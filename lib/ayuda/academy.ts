// ─────────────────────────────────────────────────────────────────────────────
// Tentare Academy: las RUTAS de aprendizaje y la ficha de cada guía de una ruta. Puro y sin `@/`.
//
// Decisión del fundador (14-nov-2026): Academy y Centro de ayuda conviven. Academy ENSEÑA (rutas, vídeos, de cero a funcionando);
// el Centro de ayuda RESUELVE (buscar una respuesta, un problema). No son dos contenidos: es el mismo registro (`registro.ts`) visto
// de dos maneras, así que una guía se escribe una vez.
//
// Una ruta es una LISTA ORDENADA de guías que ya existen: nada de contenido nuevo ni páginas vacías. Lo vigila `academy.test.ts`: cada
// guía de cada ruta tiene que existir y estar publicada, y llevar su ficha. El nivel y «lo que vas a conseguir» son a mano y cortos;
// la duración NO se inventa: solo la tiene una guía cuando hay un vídeo publicado (`ayuda_videos`), y es la del vídeo.
// ─────────────────────────────────────────────────────────────────────────────

import type { NivelVideo } from './videos.ts';

export interface FichaGuia {
  nivel: NivelVideo;
  /** «Lo que vas a conseguir»: una frase, en positivo y verdadera. */
  resultado: string;
}

/** Las guías que Academy ordena en rutas, por su clave «categoria/slug». */
export const FICHAS: Readonly<Record<string, FichaGuia>> = {
  'empezar/crear-tu-cuenta': { nivel: 'principiante', resultado: 'Tu estudio dado de alta y con tu acceso.' },
  'empezar/configurar-tu-estudio': { nivel: 'principiante', resultado: 'Los datos que ven tus clientes al reservar, en orden.' },
  'empezar/primera-semana-de-clases': { nivel: 'principiante', resultado: 'Tus salas, tus tipos de clase y tu primer horario, listos.' },
  'reservas/crear-una-clase': { nivel: 'principiante', resultado: 'Una clase (o una serie) en el calendario, con su sala, instructora y aforo.' },
  'instructores/dar-de-alta-una-instructora': { nivel: 'principiante', resultado: 'Tu primera instructora en el equipo.' },
  'clientes/crear-una-clienta': { nivel: 'principiante', resultado: 'Un cliente dado de alta, con su ficha.' },
  'bonos/tipos-de-bono': { nivel: 'principiante', resultado: 'Saber qué modelo encaja con tu estudio: bono, cuota o clase fija.' },
  'bonos/crear-un-plan': { nivel: 'principiante', resultado: 'Tu primer plan o bono creado.' },
  'pagos/conectar-stripe': { nivel: 'intermedio', resultado: 'Stripe conectado para cobrar con tarjeta.' },
  'pagos/la-pantalla-de-cobros': { nivel: 'intermedio', resultado: 'Saber quién te debe y qué has cobrado.' },
  'pagos/facturas': { nivel: 'intermedio', resultado: 'Entender las facturas de tus cobros.' },
  'bonos/renovaciones': { nivel: 'intermedio', resultado: 'Saber cómo se renueva una cuota y qué pasa si un cobro falla.' },
  'portal/que-es-el-portal': { nivel: 'principiante', resultado: 'Entender la app de tus clientes y tu página de reservas.' },
  'portal/acceso-de-una-clienta': { nivel: 'principiante', resultado: 'Saber cómo entra un cliente por primera vez.' },
  'portal/personalizar-tu-portal': { nivel: 'principiante', resultado: 'Cambiar cómo se ve la app de tus clientes.' },
  'widget/que-es-el-widget': { nivel: 'principiante', resultado: 'Saber qué es el widget de reservas y si lo necesitas.' },
  'widget/instalar-con-html': { nivel: 'intermedio', resultado: 'El widget de reservas funcionando en tu web.' },
  'automatizaciones/recordatorios-automaticos': { nivel: 'intermedio', resultado: 'Saber qué avisa Tentare por su cuenta y cómo ajustarlo.' },
};

export interface RutaAcademy {
  id: string;
  titulo: string;
  descripcion: string;
  /** «categoria/slug», en el orden en que conviene verlas. */
  guias: readonly string[];
}

export const RUTAS: readonly RutaAcademy[] = [
  {
    id: 'primera-semana',
    titulo: 'Tu primera semana',
    descripcion: 'De cuenta recién creada a un horario en pie, con tu equipo y tu primer cliente.',
    guias: ['empezar/crear-tu-cuenta', 'empezar/configurar-tu-estudio', 'empezar/primera-semana-de-clases', 'reservas/crear-una-clase', 'instructores/dar-de-alta-una-instructora', 'clientes/crear-una-clienta'],
  },
  {
    id: 'cobrar',
    titulo: 'Qué vendes y cómo cobras',
    descripcion: 'Bonos, cuotas y clases fijas, el cobro con tarjeta y cómo seguir lo que te deben.',
    guias: ['bonos/tipos-de-bono', 'bonos/crear-un-plan', 'pagos/conectar-stripe', 'pagos/la-pantalla-de-cobros', 'pagos/facturas', 'bonos/renovaciones'],
  },
  {
    id: 'tu-app',
    titulo: 'La experiencia de tus clientes',
    descripcion: 'Su app, tu página de reservas, el widget para tu web y los avisos que salen solos.',
    guias: ['portal/que-es-el-portal', 'portal/acceso-de-una-clienta', 'portal/personalizar-tu-portal', 'widget/que-es-el-widget', 'widget/instalar-con-html', 'automatizaciones/recordatorios-automaticos'],
  },
];

export function fichaDe(articulo: string): FichaGuia | null {
  return Object.hasOwn(FICHAS, articulo) ? FICHAS[articulo] : null;
}

/** La ruta a la que pertenece una guía, y la que va antes y después dentro de ella. `null` si no está en ninguna. */
export function rutaDeGuia(articulo: string): { ruta: RutaAcademy; indice: number; anterior: string | null; siguiente: string | null } | null {
  for (const ruta of RUTAS) {
    const i = ruta.guias.indexOf(articulo);
    if (i >= 0) return { ruta, indice: i, anterior: ruta.guias[i - 1] ?? null, siguiente: ruta.guias[i + 1] ?? null };
  }
  return null;
}

/** Cuántas guías de la ruta tiene hechas esta persona (las claves de `hechas` que no son de la ruta no cuentan). */
export function progresoDeRuta(ruta: RutaAcademy, hechas: ReadonlySet<string>): { hechas: number; total: number; siguiente: string | null } {
  const n = ruta.guias.filter(g => hechas.has(g)).length;
  return { hechas: n, total: ruta.guias.length, siguiente: ruta.guias.find(g => !hechas.has(g)) ?? null };
}

/** La primera ruta que esta persona ha empezado y no ha terminado, con la guía que le toca: lo único que justifica «sigue donde lo dejaste». */
export function rutaEmpezada(hechas: ReadonlySet<string>): { ruta: RutaAcademy; siguiente: string; hechas: number; total: number } | null {
  for (const ruta of RUTAS) {
    const p = progresoDeRuta(ruta, hechas);
    if (p.hechas > 0 && p.siguiente) return { ruta, siguiente: p.siguiente, hechas: p.hechas, total: p.total };
  }
  return null;
}

// ── «Marcar como hecha» ──────────────────────────────────────────────────────
// Lo que una persona ha leído o visto, en SU navegador: localStorage, como el «visto» de los tutoriales del panel
// (`tutorial-progreso.ts`, decisión del 12-oct-2026). Academy es pública: no hay sesión a la que atarlo, y no se sube a ningún sitio.
// ⚠️ No es el progreso del NEGOCIO: marcar una guía no configura nada. Ese lo calcula `lib/guia/progreso.ts` de datos reales.

export const CLAVE_HECHAS = 'tentare:academy:hechas:v1';

type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

export function leerHechas(almacen: Almacen | null): Set<string> {
  try {
    const bruto = almacen?.getItem(CLAVE_HECHAS);
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string' && x.length < 120).slice(0, 400) : []);
  } catch {
    return new Set();
  }
}

/** Marca o desmarca y devuelve el conjunto nuevo. Sin almacenamiento (navegación privada…) no falla: solo no se recuerda. */
export function marcarHecha(almacen: Almacen | null, articulo: string, hecha: boolean): Set<string> {
  const actual = leerHechas(almacen);
  if (hecha) actual.add(articulo); else actual.delete(articulo);
  try { almacen?.setItem(CLAVE_HECHAS, JSON.stringify([...actual])); } catch { /* sin almacenamiento */ }
  return actual;
}
