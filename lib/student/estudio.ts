import 'server-only';
import { getStudioSeo } from '@/lib/studio-seo';
import { urlMonograma } from '@/lib/monograma-estudio';
import type { StudioConfig } from '@/lib/student/tipos';

// Carga del estudio para la Student PWA, EN SERVIDOR y sin god-context.
//
// El paquete de diseño resuelve esto con una constante (`config/studio.ts`) y
// su propio comentario dice qué hay que hacer: «en producción la sirve el
// backend (por slug/dominio) … mantener la forma de StudioConfig». Eso es lo
// que hace esta función.
//
// ⚠️ Deliberadamente NO pasa por `StudioProvider` (lib/studio-context.tsx, 4.973
// líneas, compartido con el panel). La app de la alumna necesita seis campos
// del estudio, no ciento cincuenta, y heredar ese contexto significaba heredar
// su ciclo de carga, su polling y sus escrituras de administración. `getStudioSeo`
// ya está cacheada por request con `React.cache`, así que el layout y
// `generateMetadata` comparten una sola consulta.

/** Campos del diseño que hoy NO tienen columna propia en `studios`. */
const POLITICA_CANCELACION_POR_DEFECTO = 12;

export interface EstudioStudent extends StudioConfig {
  /** Id interno. NO se manda al cliente como autorización: la identidad sale
   *  siempre del JWT (ver `socioAutenticado`). Viaja porque las rutas públicas
   *  lo piden en el body como dato de enrutado, igual que hace /reservar. */
  id: string;
  /** Color de marca del estudio. Alimenta la familia de acento del diseño
   *  (lib/student/tema.ts); ningún componente lo lee directo. */
  colorPrimario: string;
  /** Gate de página oculta, que el layout tiene que respetar igual que /reservar. */
  paginaOculta: boolean;
  paginaTieneClave: boolean;
}

/**
 * Devuelve `null` si el slug no existe — el layout lo convierte en `notFound()`.
 *
 * `colorPrimario` alimenta la familia de acento (lib/student/tema.ts). El resto
 * de tokens del diseño son fijos y viven en `student.css`.
 */
export async function cargarEstudio(slug: string): Promise<EstudioStudent | null> {
  const s = await getStudioSeo(slug);
  if (!s) return null;

  return {
    id: s.id,
    slug: s.slug,
    nombre: s.nombre,
    ciudad: s.ciudad ?? '',
    direccion: s.direccion ?? '',
    // `logoUrl: null` es significativo en el diseño: activa el monograma con
    // las iniciales (`StudioHeader`). No se rellena con un placeholder.
    logoUrl: s.logoUrl,
    iconoUrl: urlMonograma(s.nombre, s.colorPrimario, 192),
    fotoPortada: s.fotoUrl ?? '',
    telefono: s.telefono ?? '',
    email: s.email ?? '',
    // El backend no clasifica el estudio por disciplina: `tipos_clase` es libre
    // por estudio. El diseño usa esto solo como etiqueta, así que se deja vacío
    // en vez de inventar una clasificación que no existe.
    disciplinas: [],
    // ⚠️ ORIENTATIVO. La ventana real es una cascada por tipo de clase
    // (`tipos_clase.ventana_cancelacion_horas ?? studios.cancelacion_ventana_horas`)
    // y la resuelve el SERVIDOR al cancelar. Este número solo sirve para el
    // texto informativo del sheet; nunca para decidir si se puede cancelar.
    politicaCancelacionHoras: POLITICA_CANCELACION_POR_DEFECTO,
    // Igual: `permite_lista_espera` tiene override por tipo de clase. La
    // disponibilidad real la devuelve `reservar_plaza`.
    soportaListaEspera: true,
    tema: {},
    colorPrimario: s.colorPrimario,
    paginaOculta: s.paginaOculta,
    paginaTieneClave: s.paginaTieneClave,
  };
}
