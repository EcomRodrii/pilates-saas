import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Datos mínimos del estudio para SEO y primer paint de la página pública (I-9).
// Se resuelve en el SERVIDOR y se cachea por request con React cache, de modo
// que generateMetadata y el layout comparten una única consulta.
export interface StudioSeo {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string;
  colorPrimario: string;
  logoUrl: string | null;
  slug: string;
  /**
   * Página pública oculta mientras el estudio la prepara.
   *
   * Viaja AQUÍ y no en una consulta aparte porque esta ya está cacheada por
   * request y la comparten `generateMetadata` y el layout: el gate necesita el
   * dato en los dos sitios (uno para el `noindex`, otro para no pintar la
   * página), y una segunda consulta sería la misma fila leída dos veces.
   */
  paginaOculta: boolean;
  /** Solo si hay clave configurada. **El hash NUNCA sale de aquí**: se queda
   *  en el servidor, y lo que viaja es este booleano. */
  paginaTieneClave: boolean;
  /**
   * Datos de contacto y foto, para los datos estructurados de negocio local
   * (`lib/seo/estudio-jsonld.ts`). Son columnas VIEJAS de `studios`, no de una
   * migración reciente — por eso van en el `select` base y no en la consulta
   * aparte de abajo, cuyo motivo es otro (ver su comentario).
   */
  telefono: string | null;
  email: string | null;
  codigoPostal: string | null;
  descripcion: string | null;
  /** Foto del local; el logo NO sirve como `image` de un negocio local. */
  fotoUrl: string | null;
  /** Horas antes de la clase en las que cancelar aún devuelve la sesión. */
  cancelacionVentanaHoras: number;
  /** Si el estudio admite apuntarse a una clase completa. */
  permiteListaEspera: boolean;
}

/**
 * Resultado con la causa distinguida.
 *
 * ⚠️ Existe porque `getStudioSeo` colapsa dos cosas MUY distintas en el mismo
 * `null`: «este slug no es de nadie» y «no he podido preguntarlo». Para las
 * páginas de siempre da igual —pintan «estudio no encontrado» en los dos
 * casos—, pero la app de la alumna se renderiza en servidor y convertía el
 * segundo en un 404: un parpadeo de la base de datos le decía a la clienta que
 * su estudio no existe. Y un 404 no se reintenta: se comparte, se indexa y se
 * cree.
 *
 * `getStudioSeo` sigue devolviendo `StudioSeo | null` y no cambia para sus
 * llamantes; quien necesite la causa usa esta.
 */
export type ResultadoStudioSeo =
  | { estudio: StudioSeo }
  | { estudio: null; causa: 'no-existe' }
  | { estudio: null; causa: 'no-disponible' };

export const getStudioSeoResultado = cache(async (slug: string): Promise<ResultadoStudioSeo> => {
  // Semilla E2E (B0.3): esta resolución ocurre en el SERVIDOR, así que el mock de
  // red de Playwright (nivel navegador) no la intercepta; con el env dummy de CI
  // devolvería null y la página pública mostraría "estudio no encontrado", lo que
  // mantenía la suite E2E en cuarentena (describe.skip). Con E2E_TEST=1 se siembra
  // el estudio de prueba en el servidor. NUNCA se activa en producción (la env no
  // existe allí); coincide con el fixture de e2e/booking.spec.ts.
  if (process.env.E2E_TEST === '1') {
    return { estudio: {
      id: 'studio-test', nombre: 'Tentare', ciudad: 'Málaga', direccion: 'Calle Test 1',
      colorPrimario: '#1A1A1A',
      // Mismo motivo que `E2E_PAGINA_OCULTA` de unas líneas más abajo: el icono
      // de la PWA se compone en el SERVIDOR a partir de este campo, así que
      // `page.route` no puede llegar a él y sin esta palanca el camino «el
      // estudio SÍ tiene logo» no es alcanzable por ningún test. Ausente =
      // sin logo, como siempre.
      logoUrl: process.env.E2E_LOGO_URL ?? null,
      slug,
      telefono: '+34 600 000 000', email: 'hola@studio-test.es',
      codigoPostal: '29001', descripcion: 'Estudio de prueba.', fotoUrl: null,
      cancelacionVentanaHoras: 12, permiteListaEspera: true,
      // Configurable para que el gate de página oculta se pueda ejercitar
      // alguna vez desde la suite: se decide en el SERVIDOR, así que
      // `page.route` no puede llegar a él y sin esto el camino de "oculta" no
      // es alcanzable por ningún test. Ausente = visible, como siempre.
      paginaOculta: process.env.E2E_PAGINA_OCULTA === '1' || process.env.E2E_PAGINA_OCULTA === 'con-clave',
      paginaTieneClave: process.env.E2E_PAGINA_OCULTA === 'con-clave',
    } };
  }
  const admin = getSupabaseAdmin();
  // Sin cliente de administración no es que el estudio no exista: es que no
  // podemos preguntarlo (falta la service-role key en el entorno).
  if (!admin) return { estudio: null, causa: 'no-disponible' };

  // ⚠️ **Las columnas nuevas se piden aparte, y su fallo no tumba la página.**
  //
  // PostgREST no devuelve `undefined` para una columna que no existe: rechaza
  // la CONSULTA ENTERA con un 400. Metidas en el `select` de siempre, un
  // despliegue que llegara antes que la migración dejaría a `data` en null y la
  // página pública de TODOS los estudios diría «no encontrado». Es la peor
  // avería posible de esta función y depende solo del orden de dos pasos.
  //
  // Con dos consultas, el peor caso es que la visibilidad se lea como «no
  // oculta» durante los minutos que separen el despliegue de la migración —el
  // comportamiento de hoy— en vez de una caída. Después de aplicarla, la
  // segunda consulta acierta siempre y esto deja de importar.
  const [base, visibilidad] = await Promise.all([
    admin
      .from('studios')
      .select('id, nombre, ciudad, direccion, color_primario, logo_url, slug, telefono, email, codigo_postal, descripcion, foto_url, cancelacion_ventana_horas, permite_lista_espera')
      .eq('slug', slug)
      .maybeSingle(),
    // `.then(ok, ko)` y no `.catch`: el builder de supabase-js es un
    // `PromiseLike`, no una Promise entera, y no expone `.catch`.
    Promise.resolve(
      admin
        .from('studios')
        .select('pagina_publica_oculta, pagina_publica_clave_hash')
        .eq('slug', slug)
        .maybeSingle(),
    ).then(
      (r) => r.data as { pagina_publica_oculta?: boolean; pagina_publica_clave_hash?: string | null } | null,
      () => null,
    ),
  ]);
  const data = base.data;
  // Un `error` de PostgREST NO es un estudio inexistente: es red caída, esquema
  // desincronizado o permiso denegado. `maybeSingle()` deja `data` en null en
  // los dos casos, así que hay que mirar el error para separarlos.
  if (base.error) return { estudio: null, causa: 'no-disponible' };
  if (!data) return { estudio: null, causa: 'no-existe' };
  return { estudio: {
    id: data.id,
    nombre: data.nombre ?? 'Estudio de Pilates',
    ciudad: data.ciudad ?? '',
    direccion: data.direccion ?? '',
    colorPrimario: data.color_primario ?? '#1A1A1A',
    logoUrl: data.logo_url ?? null,
    slug: data.slug ?? slug,
    telefono: data.telefono ?? null,
    email: data.email ?? null,
    codigoPostal: data.codigo_postal ?? null,
    descripcion: data.descripcion ?? null,
    fotoUrl: data.foto_url ?? null,
    // La política de verdad del estudio. La app la ENSEÑA («gratis hasta X h»,
    // «completa · lista»), así que un valor por defecto del cliente es una
    // promesa que el servidor no tiene por qué cumplir. Los `??` son solo
    // para una fila antigua sin la columna puesta, con el mismo defecto que
    // usa el servidor al resolver la cancelación.
    cancelacionVentanaHoras: (data.cancelacion_ventana_horas as number | null) ?? 12,
    permiteListaEspera: (data.permite_lista_espera as boolean | null) ?? true,
    // `=== true` y no un truthy: sin la columna todavía aplicada, «no sé» tiene
    // que significar «no oculta» y no esconder la página de todo el mundo.
    paginaOculta: visibilidad?.pagina_publica_oculta === true,
    // ⚠️ El HASH no sale de aquí. Lo que viaja es si HAY clave, porque es lo
    // único que la página necesita saber para decidir si enseña el formulario.
    paginaTieneClave: typeof visibilidad?.pagina_publica_clave_hash === 'string'
      && visibilidad.pagina_publica_clave_hash.length > 0,
  } };
});

/**
 * El contrato de siempre: el estudio o `null`, sin distinguir la causa.
 *
 * Se conserva porque lo llaman las páginas públicas, los sitemaps y los
 * manifests, y para ellos «no existe» y «no he podido leerlo» acaban en la
 * misma pantalla. Quien necesite reaccionar distinto —la app de la alumna, que
 * se pinta en servidor y no puede convertir un fallo de red en un 404— usa
 * `getStudioSeoResultado`.
 */
export const getStudioSeo = async (slug: string): Promise<StudioSeo | null> =>
  (await getStudioSeoResultado(slug)).estudio;
