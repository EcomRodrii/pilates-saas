// ─────────────────────────────────────────────────────────────────────────────
// «Tu Tentare» (P2.5): todos los módulos del menú, con lo que hacen, el plan
// que los incluye y si están en tu menú. Puro, sin `@/`.
//
// NO es un tercer catálogo: los módulos, sus grupos, nombres e iconos salen de
// `navSections`/`MODULOS` (lib/nav-config.ts, ya sin lo congelado); la frase,
// de la ficha de su pantalla (`valorDeModulo`, lib/ayuda/pantallas.ts); qué no se puede
// esconder, de `NO_OCULTABLES`; el plan, de `PLAN_ENTITLEMENTS`; el tutorial,
// de `tutorialDePantalla`. A mano solo va lo que no se puede derivar: qué
// módulo depende de una feature del plan y a qué ajuste lleva «Configurar».
//
// ⚠️ Esconder un módulo SOLO lo quita del menú lateral: no lo apaga ni quita
// ningún permiso (las automatizaciones siguen corriendo, el buscador lo sigue
// encontrando). Por eso el interruptor se llama «En tu menú» y no «Activo».
// La puerta real sigue siendo `tieneFeature()`/la RLS en el servidor.
// ─────────────────────────────────────────────────────────────────────────────

import type { ElementType } from 'react';
import { ESSENTIAL_HREFS, NO_OCULTABLES, navSections, type NavSection } from '../nav-config.ts';
import { seccionPanelNuevo } from '../nav-panel-nuevo.ts';
import { PLAN_ENTITLEMENTS, PLAN_INFO, accesoProducto, planMinimoPara, tieneFeature, type Entitlements, type Plan } from '../billing/entitlements.ts';
import { tutorialDePantalla, valorDeModulo } from '../ayuda/pantallas.ts';
import { hrefDeLugar, hrefDeSeccion, hrefDeTarjeta } from '../configuracion/destino.ts';

type Feature = keyof Entitlements['features'];

/** Los módulos del menú que dependen de una feature del plan (la puerta real está en el servidor). */
export const FEATURE_DE_MODULO: Partial<Record<string, Feature>> = {
  '/centro-de-control': 'decisiones',
};

/**
 * «Configurar»: a qué ajuste lleva cada módulo. Con las funciones tipadas de
 * Configuración (lib/configuracion/destino.ts): una sección o tarjeta que se
 * renombre no deja un enlace roto, no compila.
 */
export const CONFIGURAR: Partial<Record<string, string>> = {
  '/calendario': hrefDeLugar({ tab: 'clases', abrir: 'tipos-de-clase' }),
  '/citas': hrefDeTarjeta('horario-de-citas'),
  '/clientas': hrefDeSeccion('altas'),
  '/mensajeria': hrefDeSeccion('comunicacion'),
  '/automatizaciones': hrefDeSeccion('comunicacion'),
  '/cobros': hrefDeSeccion('cobros'),
  '/equipo': hrefDeSeccion('equipo'),
};

export interface ModuloTuTentare {
  href: string;
  label: string;
  icon: ElementType;
  frase: string;
  /** No se puede esconder (Resumen, Configuración, Suscripción). */
  fijo: boolean;
  /** Sale con el menú en «Esencial»; si no, solo con el menú en «Todo». */
  esencial: boolean;
  /** Tiene tutorial de pantalla: «Abrir y ver cómo se usa». */
  tutorial: boolean;
  /** La feature del plan de la que depende, o null. */
  feature: Feature | null;
  configurar: string | null;
}

export interface GrupoTuTentare {
  label: string | null;
  modulos: ModuloTuTentare[];
}

/**
 * Los módulos agrupados como el menú (mismo orden de grupos), con lo que vean
 * `puedeVer`. `secciones`: el menú de ESTE estudio (`seccionesDelMenu`, que con
 * el panel nuevo trae sus secciones propias, con su frase); por defecto, el de siempre.
 */
export function gruposTuTentare(puedeVer: (href: string) => boolean = () => true, secciones: NavSection[] = navSections): GrupoTuTentare[] {
  return secciones
    .map(s => ({
      label: s.label ?? null,
      modulos: s.items.filter(i => puedeVer(i.href)).map(i => ({
        href: i.href,
        label: i.label,
        icon: i.icon,
        frase: valorDeModulo(i.href) ?? seccionPanelNuevo(i.href)?.frase ?? '',
        fijo: NO_OCULTABLES.includes(i.href),
        esencial: ESSENTIAL_HREFS.includes(i.href),
        tutorial: !!tutorialDePantalla(i.href),
        feature: FEATURE_DE_MODULO[i.href] ?? null,
        configurar: CONFIGURAR[i.href] ?? null,
      })),
    }))
    .filter(g => g.modulos.length > 0);
}

/**
 * ¿Lo incluye el plan del estudio? `null` = no se sabe (sin plan o sin acceso):
 * entonces la pantalla no dice nada del plan (mejor callar que decir «necesita
 * el plan Estudio» a quien ya lo tiene). No decide qué se puede poner o quitar.
 */
export function incluidoEnPlan(m: Pick<ModuloTuTentare, 'feature'>, plan: string | null | undefined, activo: boolean | null | undefined): boolean | null {
  if (!m.feature) return true;
  if (!plan || !activo || !(plan in PLAN_ENTITLEMENTS)) return null;
  return PLAN_ENTITLEMENTS[plan as Plan].features[m.feature];
}

/** «Incluido en el plan Estudio» (el nombre comercial, de PLAN_INFO). */
export function planQueLoIncluye(m: Pick<ModuloTuTentare, 'feature'>): string | null {
  if (!m.feature) return null;
  const p = planMinimoPara(m.feature);
  return p ? PLAN_INFO[p].nombre : null;
}

/**
 * «Desde el plan Estudio» en la pantalla Módulos: el plan que haría falta, SOLO
 * cuando `tieneFeature` dice que este estudio no lo tiene. Lo que decida
 * `tieneFeature` (lib/billing) manda: si un plan pasa a incluirlo todo, la
 * chapa desaparece sin tocar esta pantalla. Sin acceso al producto (prueba
 * vencida, sin suscripción) no se dice nada: no es cosa del plan, y todo diría
 * que falta. Sin estudio cargado, tampoco.
 */
export function planQueFalta(
  m: Pick<ModuloTuTentare, 'feature'>,
  studio: { plan?: string | null; subscriptionStatus?: string | null } | null | undefined,
): string | null {
  if (!m.feature || !studio || !accesoProducto(studio)) return null;
  return tieneFeature(studio, m.feature) ? null : planQueLoIncluye(m);
}

export type EstadoEnMenu = 'en-menu' | 'solo-todo' | 'fuera';

/** Dónde se ve hoy: en el menú, solo con el menú en «Todo», o fuera. */
export function estadoEnMenu(m: Pick<ModuloTuTentare, 'href' | 'fijo' | 'esencial'>, ocultos: ReadonlySet<string>): EstadoEnMenu {
  if (!m.fijo && ocultos.has(m.href)) return 'fuera';
  return m.esencial ? 'en-menu' : 'solo-todo';
}

/**
 * Los `ocultos` tras pulsar el interruptor. Lo fijo nunca entra. Las mismas
 * reglas que el cajón «Tu menú»: dos editores del mismo dato no pueden tener
 * reglas distintas, así que un módulo que el plan no incluye se puede poner
 * igual (su pantalla ya dice que necesita otro plan; la puerta está en el
 * servidor). No toca nada más del menú (ni el orden ni el Resumen).
 */
export function ocultosTrasCambiar(ocultos: readonly string[], m: Pick<ModuloTuTentare, 'href' | 'fijo'>, enMenu: boolean): string[] | null {
  if (m.fijo) return null;
  const sin = ocultos.filter(h => h !== m.href);
  return enMenu ? sin : [...sin, m.href];
}

/**
 * «En tu menú: N de M»: los interruptores encendidos (más lo fijo), la MISMA
 * cifra que la fila «Tu menú» («19 módulos · 2 escondidos» = 17 de 19). Lo que
 * este navegador no enseña por estar en «Esencial» lo dice su propia frase.
 */
export function contar(grupos: GrupoTuTentare[], ocultos: ReadonlySet<string>) {
  const todos = grupos.flatMap(g => g.modulos);
  return { en: todos.filter(m => m.fijo || !ocultos.has(m.href)).length, de: todos.length };
}
