// ═══════════════════════════════════════════════════════════════════════════
// Galería de temas — registro de ThemeDefinition
// ═══════════════════════════════════════════════════════════════════════════
//
// Un `ThemeDefinition` es un tema con nombre y versión que el estudio puede
// elegir de un click, antes de afinar campo a campo en "Personalizar". Este
// archivo es el ÚNICO sitio que crece cuando se añade un tema nuevo (Luxury,
// Editorial, Organic…) — el editor, el runtime y el schema no cambian por
// añadir una entrada aquí, salvo que el tema nuevo necesite un eje visual que
// `ThemeConfig` todavía no tenga (en ese caso, se añade ese campo a
// `ThemeConfig` una vez, como ya se hizo con `buttonStyle`/`cardStyle`, y la
// `capability` correspondiente a la unión de abajo).
//
// `defaults` son los valores que el tema fija — el estudio parte de ahí y su
// propio `ThemeConfig` guarda lo que decide sobrescribir encima (mismo modelo
// mental que `resolveTheme()` ya usa con `DEFAULT_THEME`, un nivel más).
//
// ── Tanda de 3 temas con identidad propia (Oliva · Bloom · Noir) ────────────
// A diferencia de `geometric`/`editorial`, que solo tocaban tipografía y
// componentes, estos tres SÍ fijan paleta: son los tres puntos de partida que
// cubren los tres tipos de estudio (boutique, joven, premium). Los tres pasan
// el gate de `validarContrasteTheme()` sin tocar nada — lo verifica
// theme-definitions.test.ts recorriendo TODO el registro, así que ningún tema
// futuro puede entrar roto.
//
// `barraOscura` (Noir) fue el primer eje nuevo que pidió esta tanda; en la
// v2 se añadieron `destacado` (acento fuera de la marca), `barraFlotante`
// (Bloom, eje independiente de `barraOscura`) y `radioTema` (radio por
// pieza) — mismo patrón mecánico de 4 pasos en theme-schema.ts que ya usó
// `barraOscura`. `bloquesHome` (ver la interfaz de abajo) siembra el Inicio
// con los bloques `sistema` nuevos (`tiraSemana`, `progresoSemanal`,
// `retos`) al instalar el tema.
//
// "Retos" y "Sesión guiada", inicialmente descartados por falta de spec, se
// diseñaron después con el prototipo real de Claude Design en mano: Sesión
// guiada resultó NO tocar Vídeos/VOD (es cronómetro de cliente puro, ver
// app/portal/[slug]/clases/[sesionId]/sesion-guiada/), y Retos se construyó
// con contenido fijo (lib/retos-portal.ts) + conteo REAL de apuntadas por
// estudio (reto_participaciones, nunca la cifra de marketing del prototipo).
//
// `radioTema` completo (card+boton) y `barraClasica`, en una tercera ronda:
// la primera tanda de esta ronda solo tocaba paleta+tipografía+`radioTema.card`
// en la tarjeta hero — el resto del portal (Button.tsx/Card.tsx, listado de
// clases, Bonos) seguía con un radio fijo sin relación con el tema, así que
// los tres temas se veían "iguales pero de otro color". `radioTema.boton` +
// que Button.tsx/Card.tsx por fin lean esas vars (ver harmonic-discovering-kettle.md)
// cierran eso. `barraClasica` (Oliva/Noir) reabre a propósito, solo para
// estos 3 temas, el "único look de barra" del rediseño de agosto 2026 —
// confirmado explícitamente con el usuario tras ver que el prototipo real
// no usa la píldora flotante salvo en Bloom.

import type { ThemeConfig } from './theme-schema.ts';

export type ThemeCapability = 'colors' | 'typography' | 'buttons' | 'cards' | 'nav';

export interface ThemeDefinition {
  id: string;
  version: number;
  label: string;
  description: string;
  /** Qué ejes visuales toca este tema — metadato para el editor ("Este tema
   *  modifica: ✓ Tipografía"), no una lista exhaustiva de TODO ThemeConfig. */
  capabilities: ThemeCapability[];
  defaults: Partial<ThemeConfig>;
  /**
   * Orden Y PRESENCIA de los bloques `sistema` del Inicio al INSTALAR este
   * tema (ver `instalar()` en components/theme/theme-library.tsx) — ids de
   * `BLOQUES_SISTEMA_IDS` (lib/portal-home-bloques.ts). Los que no aparezcan
   * aquí se ocultan (`oculto: true`), nunca se borran — un bloque `sistema`
   * nunca se puede quitar del todo, y la propietaria los puede reactivar
   * después. Los bloques del CATÁLOGO que la propietaria ya haya añadido se
   * preservan siempre, al final, tal cual — cambiar de tema no borra
   * contenido. Sin este campo, instalar el tema no toca los bloques del
   * Inicio en absoluto (mismo comportamiento que `classic`/`geometric`/
   * `editorial` hoy).
   */
  bloquesHome?: string[];
}

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    // ── El PREDETERMINADO de la app de la alumna ────────────────────────────
    //
    // Va primero a propósito: es el que se ofrece de entrada y el que resuelve
    // `TEMA_PORTAL_POR_DEFECTO` (themes/registro.ts) cuando un estudio no ha
    // publicado ninguno.
    //
    // ⚠️ "Predeterminado" NO significa retroactivo. Un estudio que ya publicó
    // otro tema —o que sigue en 'classic'— conserva el suyo: `themeId` es un
    // dato de su fila, no una constante del producto. Cambiarlo por debajo
    // repintaría portales vivos en silencio, que es justo lo que este archivo
    // lleva avisando desde la primera tanda.
    //
    // Fuente: prototipo "Balance App" de Claude Design (f706a211), medido
    // sobre su HTML. Los valores de abajo son los suyos, no una interpretación.
    id: 'tentada',
    version: 1,
    label: 'Tentada',
    description: 'Verde profundo sobre crema y titulares en Garamond. El tema de casa: cálido, editorial y con la clase de hoy por delante.',
    capabilities: ['colors', 'typography', 'buttons', 'cards'],
    defaults: {
      primary: '#333B24',
      // Arena cálida: la superficie del bloque de vídeos para casa. No es
      // texto — mismo papel que `secondary` en Oliva/Noir.
      secondary: '#ECDFD2',
      accent: '#F0EDE1',
      // Tentada no tiene tercer color: el destacado es la marca otra vez,
      // igual que en Oliva.
      destacado: '#333B24',
      background: '#F6F3EB',
      text: '#22261B',
      fontId: 'jakarta',
      portalHeadingFontId: 'cormorant',
      radius: 'rounded',
      buttonStyle: 'solid',
      // Plana: el billete de la próxima clase ya lleva su propia sombra
      // (`--ticket-shadow`), y dársela a TODA tarjeta sobre un crema tan claro
      // ensucia el resto de la pantalla.
      cardStyle: 'flat',
      radioTema: { card: 20, boton: 16, chip: 999, acceso: 18 },
      // Escala del prototipo. El saludo es el número que más se separa del
      // resto de temas (44 contra 19-24): en Tentada el saludo ES el titular
      // de la pantalla, sobre la foto de la cabecera.
      escalaTexto: { seccion: 20, tituloPantalla: 26, saludo: 44, tituloHero: 25, bienvenida: 25, numeroBono: 60 },
      barraClasica: true,
      variantes: { cabeceraInicio: 'saludo', accesosRapidos: 'rejilla', barra: 'todas', tarjetaPrincipal: 'rotulada', bienvenida: 'foto' },
    },
    // `proximaClase` primero, como en los otros tres. La cabecera con foto es
    // el bloque `cabecera`, que es FIJO y va siempre encima de él.
    bloquesHome: ['proximaClase', 'tiraSemana', 'accesosRapidos', 'contenidoEstudio'],
  },
  {
    id: 'classic',
    version: 1,
    label: 'Clásico',
    description: 'Instrument Serif en los titulares — el aspecto de siempre.',
    capabilities: [],
    defaults: {},
  },
  // ⚠️ Aquí vivían 'geometric' y 'editorial'. Se retiran a propósito: la
  // biblioteca queda con el PREDETERMINADO ('classic') y los tres temas de
  // diseño (Oliva, Bloom, Noir), que es lo que se pidió.
  //
  // Los ids NO se reciclan nunca para otro tema. Un estudio puede tener
  // 'editorial' guardado en su borrador (lo tiene Pilates doll a fecha de
  // hoy): sus colores no se pierden —se guardan en su fila, no se buscan por
  // id— pero `getThemeDefinition` devuelve `undefined` y la biblioteca deja de
  // marcarle ninguna tarjeta como "En uso". Reutilizar el id le cambiaría el
  // tema por sorpresa, que es mucho peor.
  {
    id: 'oliva',
    version: 5,
    label: 'Oliva',
    description: 'Oliva profundo sobre crema. Premium, natural y sin adornos: para estudios boutique.',
    capabilities: ['colors', 'typography', 'buttons', 'cards'],
    defaults: {
      primary: '#3D4A2F',
      secondary: '#A8B394',
      accent: '#E9E4D4',
      // Oliva no tiene tercer color: su carácter es el contraste oliva/crema y
      // el aire, no un acento — `destacado` es la marca otra vez.
      destacado: '#3D4A2F',
      background: '#F5F3ED',
      text: '#2A2E22',
      fontId: 'jakarta',
      portalHeadingFontId: 'outfit',
      radius: 'rounded',
      buttonStyle: 'solid',
      // Plana a propósito: el aire y el contraste del oliva ya separan las
      // tarjetas del fondo crema. Una sombra encima las ensucia.
      cardStyle: 'flat',
      // Valores exactos del prototipo (paleta() → radCard/radBoton/radChip).
      radioTema: { card: 26, boton: 20, chip: 999, acceso: 20 },
      // Escala tipográfica: valores EXACTOS de `typography.scale` en el
      // tokens.json que entregó diseño. Es token del tema, no constante del
      // producto — el portal usaba 24 y 30 en rótulos sin criterio.
      escalaTexto: { seccion: 17, tituloPantalla: 30, saludo: 19, tituloHero: 25, bienvenida: 46, numeroBono: 60 },
      barraClasica: true,
      // Forma por bloque: rejilla de baldosas y la barra con las 4 etiquetas
      // y el icono activo relleno (`relleno: activo && esOliva` del prototipo).
      variantes: { cabeceraInicio: 'saludo', accesosRapidos: 'rejilla', barra: 'todasRelleno', tarjetaPrincipal: 'rotulada', bienvenida: 'foto' },
    },
    // La tarjeta de "próxima clase" está siempre arriba, fuera de este
    // sistema — no es un bloque `sistema` reordenable, ver
    // portal-home-view.tsx. Esto ordena lo que SÍ lo es: accesos rápidos, la
    // tira de los 7 días, luego lo del estudio. `estaSemana`/`invitarAmiga`
    // no están en la lista → se instalan OCULTOS, no borrados (el encargo no
    // los pide en el Inicio de Oliva; la propietaria los puede reactivar).
    bloquesHome: ['proximaClase', 'accesosRapidos', 'tiraSemana', 'contenidoEstudio'],
  },
  {
    id: 'bloom',
    version: 5,
    label: 'Bloom',
    description: 'Lila y rosa, esquinas de píldora y una barra que flota. Energía y comunidad, para público joven.',
    capabilities: ['colors', 'typography', 'buttons', 'cards', 'nav'],
    defaults: {
      primary: '#7C5CFC',
      secondary: '#EFEAFF',
      accent: '#F1EEFE',
      // El rosa NO es la marca: es el acento. Como fondo de botón se pierde
      // contra el lila; como icono activo de la barra flotante es la firma
      // del tema.
      destacado: '#FF8FB1',
      background: '#FFFFFF',
      text: '#1B1430',
      fontId: 'poppins',
      portalHeadingFontId: 'poppins',
      radius: 'pill',
      buttonStyle: 'solid',
      cardStyle: 'elevated',
      // Barra flotante — eje independiente de tabBarStyle (que ya no se lee
      // en render, ver comentario de barraFlotanteSchema en theme-schema.ts).
      barraFlotante: true,
      // Valores exactos del prototipo: botón 100% píldora (radBoton: 999).
      radioTema: { card: 30, boton: 999, chip: 999, acceso: 22 },
      // Escala tipográfica: valores EXACTOS de `typography.scale` en el
      // tokens.json que entregó diseño. Es token del tema, no constante del
      // producto — el portal usaba 24 y 30 en rótulos sin criterio.
      escalaTexto: { seccion: 20, tituloPantalla: 28, saludo: 19, tituloHero: 25, bienvenida: 33, numeroBono: 60 },
      // Bloom es el ÚNICO que conserva la píldora flotante, así que su barra
      // sigue con etiqueta solo en la activa (`conTexto: !tabPill || activo`).
      // Cabecera con titular grande y retos con fondo de color propio.
      variantes: { cabeceraInicio: 'titular', accesosRapidos: 'rejilla', retos: 'color', tarjetaPrincipal: 'rotulada', bienvenida: 'foto' },
    },
    // Retos primero, como en el prototipo original — justo antes de
    // "Accesos rápidos". Contenido fijo (lib/retos-portal.ts) + conteo REAL
    // de apuntadas por estudio (nunca la cifra de marketing del prototipo).
    bloquesHome: ['proximaClase', 'retos', 'accesosRapidos', 'contenidoEstudio'],
  },
  {
    id: 'noir',
    // 4 → 5: `cardStyle` pasa de flat a elevated. Sube la versión porque
    // `defaults` NO es retroactivo — sin esto, un estudio que ya tenga Noir
    // instalado se queda con las tarjetas planas para siempre y sin enterarse.
    version: 6,
    label: 'Noir',
    description: 'Verde casi negro con dorado y barra inferior oscura. Lujo discreto, para marcas muy cuidadas.',
    capabilities: ['colors', 'typography', 'buttons', 'cards', 'nav'],
    defaults: {
      primary: '#1E2B22',
      // Superficie suave, no el acento — ver `destacado` abajo.
      secondary: '#A9B79B',
      accent: '#EFE8D5',
      // El dorado NO es el color de marca: es el acento. Como relleno de botón
      // daría bajo contraste con texto claro; como icono activo y detalle
      // sobre el verde oscuro es exactamente lo que hace que el tema se lea
      // como premium.
      destacado: '#D9B166',
      background: '#F6F5F0',
      text: '#17201A',
      fontId: 'jakarta',
      portalHeadingFontId: 'instrumentSansBold',
      radius: 'rounded',
      buttonStyle: 'solid',
      // ⚠️ Aquí decía `flat`, con el comentario "plana como Oliva a propósito —
      // el prototipo solo da sombra a Bloom". Era una lectura del prototipo que
      // contradice la tabla de valores del encargo (`entrega/HANDOFF-temas.md`,
      // §1), que para Noir dice `elevated` explícitamente. Manda la tabla:
      // es la fuente que el diseño da como "sácalos de aquí, no del ojo".
      cardStyle: 'elevated',
      barraOscura: true,
      barraClasica: true,
      // Valores exactos del prototipo (paleta() → radCard/radBoton de Noir).
      radioTema: { card: 24, boton: 18, chip: 999 },
      // Escala tipográfica: valores EXACTOS de `typography.scale` en el
      // tokens.json que entregó diseño. Es token del tema, no constante del
      // producto — el portal usaba 24 y 30 en rótulos sin criterio.
      escalaTexto: { seccion: 17, tituloPantalla: 28, saludo: 24, tituloHero: 26, bienvenida: 40, numeroBono: 60 },
      // Accesos en CÍRCULO (el rasgo propio de Noir en el prototipo, frente a
      // las baldosas de Oliva/Bloom) y barra con las 4 etiquetas — pero sin
      // relleno: el icono activo de Noir es dorado, no macizo.
      variantes: { cabeceraInicio: 'nombre', accesosRapidos: 'circulos', barra: 'todas', tarjetaPrincipal: 'rotulada', bienvenida: 'marca' },
    },
    // El anillo de progreso semanal primero, luego accesos rápidos.
    bloquesHome: ['proximaClase', 'progresoSemanal', 'accesosRapidos', 'contenidoEstudio'],
  },
];

export function getThemeDefinition(id: string): ThemeDefinition | undefined {
  return THEME_DEFINITIONS.find((t) => t.id === id);
}
