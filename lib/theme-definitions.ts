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
// (Bloom, eje independiente de `barraOscura`) y `radioTema` (radio por pieza
// SOLO en las secciones nuevas) — mismo patrón mecánico de 4 pasos en
// theme-schema.ts que ya usó `barraOscura`. `bloquesHome` (ver la interfaz
// de abajo) siembra el Inicio con los bloques `sistema` nuevos (`tiraSemana`,
// `progresoSemanal`, `retos`) al instalar el tema.
//
// "Retos" y "Sesión guiada", inicialmente descartados por falta de spec, se
// diseñaron después con el prototipo real de Claude Design en mano: Sesión
// guiada resultó NO tocar Vídeos/VOD (es cronómetro de cliente puro, ver
// app/portal/[slug]/clases/[sesionId]/sesion-guiada/), y Retos se construyó
// con contenido fijo (lib/retos-portal.ts) + conteo REAL de apuntadas por
// estudio (reto_participaciones, nunca la cifra de marketing del prototipo).

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
    id: 'classic',
    version: 1,
    label: 'Clásico',
    description: 'Instrument Serif en los titulares — el aspecto de siempre.',
    capabilities: [],
    defaults: {},
  },
  {
    id: 'geometric',
    version: 1,
    label: 'Geométrico',
    description: 'Titulares en Outfit, una geométrica de trazo limpio. Mismos colores de marca.',
    capabilities: ['typography'],
    defaults: { portalHeadingFontId: 'outfit' },
  },
  {
    id: 'editorial',
    version: 1,
    label: 'Editorial',
    // Sin la palabra "tarjetas" a propósito: colisionaba con el encabezado
    // de esa sección en "Personalizar" (getByText('Tarjetas') dejaba de ser
    // único, e2e/apariencia-boton-tarjeta.spec.ts).
    description: 'Titulares en negrita, contenido destacado y barra inferior con pestaña expandible.',
    capabilities: ['typography', 'buttons', 'cards', 'nav'],
    defaults: {
      portalHeadingFontId: 'instrumentSansBold',
      buttonStyle: 'solid',
      cardStyle: 'elevated',
      tabBarStyle: 'pestanaActiva',
    },
  },
  {
    id: 'oliva',
    version: 2,
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
    },
    // La tarjeta de "próxima clase" está siempre arriba, fuera de este
    // sistema — no es un bloque `sistema` reordenable, ver
    // portal-home-view.tsx. Esto ordena lo que SÍ lo es: accesos rápidos, la
    // tira de los 7 días, luego lo del estudio. `estaSemana`/`invitarAmiga`
    // no están en la lista → se instalan OCULTOS, no borrados (el encargo no
    // los pide en el Inicio de Oliva; la propietaria los puede reactivar).
    bloquesHome: ['accesosRapidos', 'tiraSemana', 'contenidoEstudio'],
  },
  {
    id: 'bloom',
    version: 2,
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
      // Solo la tarjeta de próxima clase pisa el radio fijo del portal — el
      // resto (botones, chips) sigue con los números de siempre; retrofit
      // completo descartado a propósito, ver harmonic-discovering-kettle.md.
      radioTema: { card: 30 },
    },
    // Retos primero, como en el prototipo original — justo antes de
    // "Accesos rápidos". Contenido fijo (lib/retos-portal.ts) + conteo REAL
    // de apuntadas por estudio (nunca la cifra de marketing del prototipo).
    bloquesHome: ['retos', 'accesosRapidos', 'contenidoEstudio'],
  },
  {
    id: 'noir',
    version: 2,
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
      cardStyle: 'elevated',
      barraOscura: true,
    },
    // El anillo de progreso semanal primero, luego accesos rápidos.
    bloquesHome: ['progresoSemanal', 'accesosRapidos', 'contenidoEstudio'],
  },
];

export function getThemeDefinition(id: string): ThemeDefinition | undefined {
  return THEME_DEFINITIONS.find((t) => t.id === id);
}
