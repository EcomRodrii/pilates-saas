// El registro de temas del portal: UNA copia del código, los temas como datos.
//
// Los tres proyectos que entregó diseño (Oliva/Bloom/Noir) comparten 56 de 56
// ficheros salvo dos — `config.ts` y `tokens.css`. Medido, no supuesto. Por eso
// aquí no hay tres copias de nada: hay tres entradas de datos y un solo
// `components/portal-tema/`.
//
// El tema activo se elige poniendo `data-theme` en <html>. Los tres bloques de
// tokens conviven en el bundle (cada uno bajo `[data-theme="…"]`), así que
// cambiar de tema no recarga ninguna hoja.

import { THEME as OLIVA } from './oliva/config.ts';
import { THEME as BLOOM } from './bloom/config.ts';
import { THEME as NOIR } from './noir/config.ts';
import type { ThemeConfig } from '../components/portal-tema/tipos-tema.ts';

export type TemaPortalId = 'oliva' | 'bloom' | 'noir';

export const TEMAS_PORTAL: Record<TemaPortalId, ThemeConfig> = {
  oliva: OLIVA,
  bloom: BLOOM,
  noir: NOIR,
};

export const TEMAS_PORTAL_IDS = Object.keys(TEMAS_PORTAL) as TemaPortalId[];

export function esTemaPortal(id: string | null | undefined): id is TemaPortalId {
  return !!id && id in TEMAS_PORTAL;
}

// ── Los controles de la propietaria, mapeados a tokens ──────────────────────
//
// ⚠️ `radioTema` y `escalaTexto` NO son variantes del tema: son ajustes que la
// propietaria toca desde Apariencia y que ya usa. No se retiran con el resto
// del sistema viejo — se traducen a los tokens del tema nuevo, que es lo único
// que cambia. Lo que sí se retira son las `variantes`, porque su papel lo hacen
// ahora los `features` de cada tema.
//
// Se emiten como custom properties EN LÍNEA sobre el contenedor del portal, así
// que pisan al bloque `[data-theme]` por especificidad sin tocar su fichero.

/** `radioTema` (px) → los tokens de radio del tema. */
export function varsRadioSobreTema(radio: {
  card?: number; boton?: number; chip?: number; acceso?: number;
} | undefined): Record<string, string> {
  if (!radio) return {};
  const v: Record<string, string> = {};
  if (radio.card !== undefined) v['--radius-card'] = `${radio.card}px`;
  if (radio.boton !== undefined) v['--radius-button'] = `${radio.boton}px`;
  if (radio.chip !== undefined) v['--radius-chip'] = `${radio.chip}px`;
  if (radio.acceso !== undefined) v['--radius-quick'] = `${radio.acceso}px`;
  return v;
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
    numeroBono: 'pass-number',
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
