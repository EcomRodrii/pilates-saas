import 'server-only';
import { getStudioSeoResultado } from '@/lib/studio-seo';
import { urlMonograma } from '@/lib/monograma-estudio';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';
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
/**
 * `null` = este slug no es de ningún estudio → 404 legítimo.
 * `'no-disponible'` = no hemos podido preguntarlo → error, NUNCA 404.
 *
 * La diferencia importa: un 404 le dice a la clienta que su estudio no existe,
 * se comparte y se indexa. Un parpadeo de la base de datos no puede producir
 * eso. Ver `getStudioSeoResultado`.
 */
export async function cargarEstudio(slug: string): Promise<EstudioStudent | null | 'no-disponible'> {
  const r = await getStudioSeoResultado(slug);
  if (!r.estudio) return r.causa === 'no-disponible' ? 'no-disponible' : null;
  const s = r.estudio;

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
    // Foto de portada del estudio o, si no ha subido ninguna, una de las diez
    // del repo (`lib/imagenes-por-defecto.ts`). Sin esto, el héroe de la
    // pantalla de acceso sale en negro para todo estudio recién dado de alta —
    // que es justo el primer contacto de su primera clienta. La `semilla` es
    // el slug: así cada estudio recibe SIEMPRE la misma, y no una distinta en
    // cada carga.
    fotoPortada: imagenDeEstudio('portada', s.fotoUrl, s.slug),
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
