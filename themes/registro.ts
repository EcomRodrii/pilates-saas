// El registro de temas del portal: UNA copia del código, los temas como datos.
//
// Los tres proyectos que entregó diseño (Oliva/Bloom/Noir) comparten 56 de 56
// ficheros salvo dos — `config.ts` y `tokens.css`. Medido, no supuesto. Por eso
// aquí no hay una copia por tema: hay cuatro entradas de datos y un solo
// `components/portal-tema/`. Tentada (el predeterminado, del prototipo
// "Balance App") entró después por esta misma puerta: dos ficheros de datos y
// tres banderas nuevas, cero código propio. Sereno, el quinto, entró igual: el
// paquete que entregó Claude Design ya venía en ESTE formato (config.ts +
// tokens.css contra el contrato de `tipos-tema.ts`), así que no hubo que
// traducir nada — solo el rótulo de sección necesitó tokens que su tokens.css
// no traía.
//
// El tema activo se elige poniendo `data-theme` en <html>. Los cinco bloques de
// tokens conviven en el bundle (cada uno bajo `[data-theme="…"]`), así que
// cambiar de tema no recarga ninguna hoja.

import { THEME as TENTADA } from './tentada/config.ts';
import { THEME as OLIVA } from './oliva/config.ts';
import { THEME as BLOOM } from './bloom/config.ts';
import { THEME as NOIR } from './noir/config.ts';
import { THEME as SERENO } from './sereno/config.ts';
import type { ThemeConfig } from '../components/portal-tema/tipos-tema.ts';
import { RADIO_PRESET_PX, type RadiusId } from '../lib/theme-schema.ts';
import { hexARgb } from '../lib/wcag-contrast.ts';

export type TemaPortalId = 'tentada' | 'oliva' | 'bloom' | 'noir' | 'sereno';

/**
 * `tentada` va PRIMERO porque es el predeterminado: es el que se resuelve
 * cuando un estudio todavía no ha publicado ninguno (ver `TEMA_PORTAL_POR_DEFECTO`)
 * y el primero que se ofrece en la biblioteca.
 */
export const TEMAS_PORTAL: Record<TemaPortalId, ThemeConfig> = {
  tentada: TENTADA,
  oliva: OLIVA,
  bloom: BLOOM,
  noir: NOIR,
  sereno: SERENO,
};

/**
 * El tema de la app de la alumna cuando el estudio no ha elegido ninguno.
 *
 * ⚠️ Esto NO cambia el tema de un estudio que ya publicó otro: `themeId` es un
 * dato suyo y sigue mandando. Solo decide qué se pinta cuando no hay ninguno,
 * que antes era Oliva por ser el primero de la lista.
 */
export const TEMA_PORTAL_POR_DEFECTO: TemaPortalId = 'tentada';

export const TEMAS_PORTAL_IDS = Object.keys(TEMAS_PORTAL) as TemaPortalId[];

/**
 * ⚠️ Decisión del fundador (2026-08-27): se retira el sistema de temas del
 * kit por completo — "borrar solo los temas. como si no existiera ninguno.
 * borra todo el diseño." Esto es lo CONTRARIO del plan que documentaba
 * `lib/portal-tema/caducidad.ts` (retirar las vistas "de siempre" y quedarse
 * con el kit) — ese fichero y `themes/RETOMAR.md` se borran en este mismo
 * cambio por describir el sentido equivocado.
 *
 * Este es el interruptor real: SIEMPRE `false`, así que
 * `components/portal/portal-shell.tsx` nunca vuelve a montar
 * `PortalTemaMarco` sin importar qué `themeId` tenga guardado un estudio
 * (ninguno real lo tiene ya — verificado en producción antes de este
 * cambio). El resto del sistema (los 5 `THEME_DEFINITIONS` no-`classic`,
 * `components/portal-tema/`, `themes/{tentada,oliva,bloom,noir,sereno}/`)
 * se retira en un PR aparte — este cambio es la red de seguridad primero,
 * sin borrar nada todavía.
 */
export function esTemaPortal(_id: string | null | undefined): _id is TemaPortalId {
  return false;
}

/**
 * El id de tema que SÍ se puede persistir en `studio_theme.themeId` — el
 * pedido si es de los cuatro del kit, o el por defecto si no.
 *
 * Existe porque ya se rompió una vez sin él: la extracción de colores de un
 * tema importado (`app/api/theme/importado/.../route.ts`) escribió el
 * literal `'importado'` directamente en `themeId`, y como nada valida ese
 * campo al guardar, `esTemaPortal()` lo rechazó silenciosamente en el
 * siguiente render — `PortalShell` cerró la puerta del kit y el portal REAL
 * de la socia cayó al de siempre, sin ningún error ni aviso. Estuvo así dos
 * días en el estudio piloto antes de que alguien lo notara.
 *
 * Cualquier código que vaya a escribir un `themeId` a partir de un valor que
 * no sea uno de los cuatro literales de este fichero —extraído, importado,
 * copiado de otro campo— pasa por aquí primero.
 */
export function themeIdSeguro(pedido: string | null | undefined, porDefecto: TemaPortalId = TEMA_PORTAL_POR_DEFECTO): TemaPortalId {
  return esTemaPortal(pedido) ? pedido : porDefecto;
}

// ── Los controles de la propietaria, mapeados a tokens ──────────────────────
//
// ⚠️ `radioTema` y `escalaTexto` NO son variantes del tema: son ajustes que la
// propietaria toca desde Apariencia y que ya usa. No se retiran con el resto
// del sistema viejo — se traducen a los tokens del tema nuevo, que es lo único
// que cambia. Lo que sí se retira son las `variantes`, porque su papel lo hacen
// ahora los `features` de cada tema.
//
// ⚠️ Esto existía —`varsRadioSobreTema` y `varsEscalaSobreTema`— y NO lo
// llamaba nadie: cero callers, comprobado. O sea que la propietaria cambiaba
// los radios y el cuerpo de letra en Apariencia y el portal nuevo seguía igual.
// Y faltaba lo más visible de todo, el COLOR. Ahora lo emite `ThemeStyle`
// (`components/theme-style.tsx`) junto al tema del portal viejo, y entra
// `varsColorSobreTema`.
//
// De paso: `varsRadioSobreTema` escribía `--radius-quick`, que no existe en
// ningún tema. El token es `--radius-quick-link`.

/**
 * Los colores y la letra que la propietaria elige → los tokens del kit.
 *
 * Solo lo que el editor ofrece de verdad. Las superficies y los neutros
 * (`--surface`, `--border`, `--muted`) se quedan los del tema: no hay control
 * para ellos, e inventarlos aquí sería decidir por el tema.
 *
 * ⚠️ El ACENTO tampoco se traduce, y esto costó verlo en producción. La misma
 * palabra significa cosas distintas en los dos vocabularios: en el panel y en
 * el portal viejo `--accent` es un FONDO pálido (`bg: 'var(--accent)'` en las
 * píldoras del dashboard), y en el kit es TINTA — el dorado de Noir, el rosa
 * de Bloom. Traducir uno por otro metía el crema `#F0EDE1` de Tentada donde el
 * tema pone su verde. Si algún día el editor ofrece un acento de tinta, será
 * un control nuevo, no este.
 *
 * Con los ficheros de tema ya derivados de su propia paleta base (ver
 * `themes/tentada/tokens.css`), pisar `--brand` arrastra los once sitios que
 * antes repetían el verde a mano — la pestaña activa, el punto del horario,
 * el corazón, la marca del billete. Sin esa derivación, esto recolorearía
 * media pantalla y dejaría la otra media, que es peor que no tocar nada.
 */
export function varsColorSobreTema(c: {
  primary?: string; onPrimary?: string; secondary?: string;
  background?: string | null; text?: string;
  fontStack?: string; headingStack?: string; headingWeight?: string;
  // `destacado` ("Acento") sobre el kit: TINTA (el dorado de Noir, el rosa de
  // Bloom), nunca el fondo pálido del vocabulario viejo — ver el comentario de
  // arriba. Ausente = hereda el acento propio del tema, no se fuerza nada.
  accent?: string;
}): Record<string, string> {
  const v: Record<string, string> = {};
  if (c.primary) v['--brand'] = c.primary;
  if (c.onPrimary) v['--on-brand'] = c.onPrimary;
  if (c.secondary) v['--support'] = c.secondary;
  if (c.background) v['--bg'] = c.background;
  if (c.text) v['--ink'] = c.text;
  if (c.fontStack) v['--font-body'] = c.fontStack;
  if (c.headingStack) v['--font-display'] = c.headingStack;
  if (c.headingWeight) v['--weight-display'] = c.headingWeight;
  if (c.accent) v['--accent'] = c.accent;
  return v;
}

/** `radioTema` (px) → los tokens de radio del tema. */
export function varsRadioSobreTema(radio: {
  card?: number; boton?: number; chip?: number; acceso?: number;
} | undefined): Record<string, string> {
  if (!radio) return {};
  const v: Record<string, string> = {};
  if (radio.card !== undefined) v['--radius-card'] = `${radio.card}px`;
  if (radio.boton !== undefined) v['--radius-button'] = `${radio.boton}px`;
  if (radio.chip !== undefined) v['--radius-chip'] = `${radio.chip}px`;
  if (radio.acceso !== undefined) v['--radius-quick-link'] = `${radio.acceso}px`;
  return v;
}

/**
 * `radius` (preset Recto/Redondeado/Píldora, "de siempre") → los 4 tokens de
 * radio del kit, como valor de PARTIDA. `varsRadioSobreTema` (el ajuste fino
 * por pieza) se llama DESPUÉS y pisa encima — mismo orden que en
 * `lib/theme-runtime.ts` para el portal "de siempre". Sin preset elegido
 * (`null`, el default), no declara nada: el tema del kit conserva su propia
 * esquina, que es su identidad visual (la píldora de Bloom, la esquina suave
 * de Oliva) — pisarla con un valor fijo sin que nadie lo pida sería el mismo
 * bug que esto arregla, solo que en la dirección contraria.
 */
export function varsRadioPresetSobreTema(radius: RadiusId | null | undefined): Record<string, string> {
  if (!radius) return {};
  const preset = RADIO_PRESET_PX[radius];
  return {
    '--radius-card': `${preset.card}px`,
    '--radius-button': `${preset.boton}px`,
    '--radius-chip': `${preset.chip}px`,
    '--radius-quick-link': `${preset.acceso}px`,
  };
}

/**
 * `buttonStyle` ("de siempre") → el botón primario del kit. Mismo criterio
 * que `varsSombraSobreTema`: 'solid' (el default) no declara nada — el botón
 * conserva `--brand`/`--on-brand` de siempre, que es lo que `03-buttons.css`
 * ya pintaba. Antes, elegir "Contorno"/"Suave" en un tema del kit no cambiaba
 * nada: el campo se guardaba (sobrevivía a publicar) pero `.btn--primary`
 * solo leía `--brand`/`--on-brand` a secas, sin ningún var que ese estilo
 * pudiera pisar (mitad del hallazgo C1 de la auditoría de uso real,
 * 2026-08-24 — la otra mitad es `varsRadioPresetSobreTema`, arriba).
 */
export function varsBotonSobreTema(buttonStyle: string | undefined, primary: string | undefined): Record<string, string> {
  if (!primary) return {};
  if (buttonStyle === 'outline') {
    return {
      '--btn-primary-bg': 'transparent',
      '--btn-primary-fg': primary,
      '--btn-primary-border': `1px solid ${primary}`,
    };
  }
  if (buttonStyle === 'soft') {
    // rgba(), no color-mix(): mismo motivo que varsBoton en theme-runtime.ts
    // (Safari <16.2 no soporta color-mix() como valor de custom property).
    const rgb = hexARgb(primary);
    return {
      '--btn-primary-bg': rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : `color-mix(in srgb, ${primary} 15%, transparent)`,
      '--btn-primary-fg': primary,
      '--btn-primary-border': 'none',
    };
  }
  return {};
}

/**
 * `cardStyle` ("de siempre") → la sombra de tarjeta del kit. Primera pieza de
 * llevar el kit hacia el editor real: antes, elegir "Elevada"/"Con borde" en
 * la categoría "Tarjetas" del editor no cambiaba NADA en el preview de un
 * tema del kit — el campo existía, pero nada lo leía del lado del kit.
 *
 * Mismo criterio que `varsTarjeta` (lib/theme-runtime.ts) para la app de
 * siempre: `flat` (el default) no declara nada — el tema conserva su propia
 * sombra de reposo (la que arregló el PR de Oliva/Tentada), en vez de
 * pisarla con un `none` que la aplanaría de vuelta. `elevated` SÍ pisa con
 * una sombra más marcada, teñida con la tinta del tema (`ink`) en vez de un
 * negro plano — así "elevada" en Sereno se sigue viendo cálida, y en Noir
 * oscura, no el mismo gris en los cinco temas. `bordered` apaga la sombra a
 * propósito (el borde, que el kit ya pinta siempre, pasa a ser la única
 * pista de límite).
 */
export function varsSombraSobreTema(cardStyle: string | undefined, ink: string | undefined): Record<string, string> {
  if (cardStyle === 'elevated') {
    const tinte = ink ? `color-mix(in srgb, ${ink} 32%, transparent)` : 'rgba(20,28,22,.32)';
    const tinteHover = ink ? `color-mix(in srgb, ${ink} 46%, transparent)` : 'rgba(20,28,22,.46)';
    return {
      '--shadow-card': `0 12px 26px -18px ${tinte}`,
      '--shadow-card-hover': `0 20px 44px -26px ${tinteHover}`,
    };
  }
  if (cardStyle === 'bordered') {
    return { '--shadow-card': 'none', '--shadow-card-hover': 'none' };
  }
  return {};
}

/**
 * `barraOscura` ("de siempre") → el fondo de la barra de navegación del kit
 * (`TabBar`, `components/portal-tema/components/layout/chrome.tsx`, que lee
 * `--tab-bar-bg` en `05-navigation.css`). Mismo criterio que el resto de este
 * fichero: ausente/`false` no declara nada — la barra conserva el fondo
 * propio del tema (`--surface`, o el translúcido con blur de Sereno), que es
 * su identidad visual, no un valor por defecto que valga pisar en el `false`.
 *
 * Solo Noir nace con este campo a `true` en `THEME_DEFINITIONS`, y su propio
 * `tokens.css` YA fija `--tab-bar-bg: var(--brand)` — conectar este campo es
 * un no-op para esa instalación de fábrica, no un cambio de aspecto.
 *
 * Límite conocido y aceptable (mismo que ya tiene `varsBarra()`, el
 * vocabulario viejo, para este mismo campo): un estudio en Noir no puede
 * "apagar" la barra oscura solo con `barraOscura:false`, porque `tokens.css`
 * ya trae ese fondo fijo por debajo. No hay caso de uso real hoy que lo pida.
 */
export function varsBarraOscuraSobreTema(barraOscura: boolean | undefined): Record<string, string> {
  if (!barraOscura) return {};
  return { '--tab-bar-bg': 'var(--brand)' };
}

/**
 * `escalaTexto` (px por paso) → un MULTIPLICADOR sobre los `--size-*` del tema.
 *
 * Multiplicador y no valor absoluto: los tokens del tema ya traen la escala
 * completa y coherente entre sí (`section`, `hero-title`, `screen-title`…).
 * Escribir un px suelto encima rompería esa relación; un factor la conserva.
 * El factor sale de comparar lo que pide la propietaria contra lo que el tema
 * declara para ESE paso.
 */
export function varsEscalaSobreTema(
  escala: Record<string, number | undefined> | undefined,
  tema: ThemeConfig,
): Record<string, string> {
  if (!escala) return {};
  const porToken = new Map(tema.designSystem.type.map((t) => [t.token, t.size]));
  const PASO_A_TOKEN: Record<string, string> = {
    seccion: 'section',
    tituloPantalla: 'screen-title',
    tituloHero: 'hero-title',
    bienvenida: 'welcome',
    saludo: 'greeting',
    // ⚠️ `numeroBono` NO entra, y por poco no se ve: el «60» del editor es el
    // numerazo del saldo en el portal viejo, y el `pass-number` del kit son
    // 18px (el nombre del bono). El cociente salía 3.33 y, como el factor es
    // un PROMEDIO, inflaba TODA la escala un 47 % — medido en el HTML que
    // servía producción: el saludo de Tentada salía a 64.5px en vez de a 44.
    // Un paso que no corresponde de verdad envenena el promedio entero.
  };
  // El factor sale de los pasos que la propietaria SÍ ha tocado, promediados.
  // Uno solo para todos: si cada paso llevara el suyo, la escala dejaría de
  // ser una escala y volveríamos a los números sueltos que ya nos costaron un
  // 24-contra-30 sin criterio.
  const factores: number[] = [];
  for (const [paso, token] of Object.entries(PASO_A_TOKEN)) {
    const pedido = escala[paso];
    const base = porToken.get(token);
    if (pedido !== undefined && base) factores.push(pedido / base);
  }
  if (factores.length === 0) return {};
  const factor = factores.reduce((a, b) => a + b, 0) / factores.length;
  // Sin desviación real, no se declara nada: el tema manda y "ausente" sigue
  // significando "hereda".
  if (Math.abs(factor - 1) < 0.01) return {};

  const v: Record<string, string> = {};
  // Se aplica a TODOS los pasos del tema, no solo a los tocados: es lo que
  // conserva las proporciones internas que el tema ya trae resueltas.
  for (const t of tema.designSystem.type) {
    v[`--size-${t.token}`] = `${Math.round(t.size * factor * 10) / 10}px`;
  }
  return v;
}
