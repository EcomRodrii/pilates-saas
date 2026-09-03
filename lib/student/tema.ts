// Puente entre los dos vocabularios de tema que conviven en este repo.
//
// El paquete de diseño (`tentare-student-pwa-design.zip`) nombra sus tokens
// `--primary`, `--accent`, `--background`… y los aplica EN CLIENTE, dentro de
// un `useEffect` (`lib/theme.ts` → `aplicarTema`). El repo emite otros 39 con
// prefijo `--portal-*` desde `lib/theme-runtime.ts` y los inyecta EN SERVIDOR
// como `<style>` (`components/theme-style.tsx`), que es lo que evita el
// destello de tema.
//
// DESIGN CONFLICT resuelto aquí, y documentado:
//   · Pide el diseño: `aplicarTema(studio.tema)` en un efecto de cliente.
//   · Impone el backend: el tema publicado vive en `studio_theme` y se resuelve
//     en servidor; aplicarlo tras hidratar significa pintar la primera pasada
//     con la paleta de "Studio Alma" y cambiarla a la vista de la alumna.
//   · Solución: se conservan los NOMBRES y los VALORES del diseño, pero se
//     emiten en servidor. `aplicarTema` no se porta.
//
// Qué se sobrescribe por estudio: la familia de ACENTO. Es exactamente lo que
// `config/studio.ts` del paquete documenta como sobrescribible (su ejemplo
// comentado son `--accent`, `--accent-soft`, `--accent-soft-foreground` y
// `--accent-deep`). `--primary` sigue siendo la tinta del kit: en el diseño el
// CTA principal es negro en TODAS las pantallas, y cambiarlo por el color del
// estudio rompería el contraste calculado de los botones sobre foto.

import { hexToHsl, hslToHex, colorLegibleSobreClaro } from '@/lib/color-utils';

/** Los cuatro tokens de acento que un estudio puede teñir. */
export interface AcentoStudent {
  accent: string;
  accentForeground: string;
  accentSoft: string;
  accentSoftForeground: string;
  accentDeep: string;
  accentDeepForeground: string;
  accentDeepMuted: string;
}

/** Valores del paquete, para cuando el estudio no tiene color propio. */
const ACENTO_POR_DEFECTO: AcentoStudent = {
  accent: '#3E6B4A',
  accentForeground: '#FFFFFF',
  accentSoft: '#EAF0E7',
  accentSoftForeground: '#2E5A3A',
  accentDeep: '#12291A',
  accentDeepForeground: '#EAF0E7',
  accentDeepMuted: '#A8D0A9',
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Deriva la familia de acento desde el color de marca del estudio.
 *
 * Las luminosidades salen de los valores del propio paquete medidos en HSL, no
 * de números redondos: el verde de referencia `#3E6B4A` es L=33, su `soft`
 * L=93, el `soft-foreground` L=27 y el `deep` L=12. Se conservan esas
 * distancias para que un estudio terracota o azul mantenga la MISMA relación
 * visual entre los cuatro, que es lo que hace que el diseño siga leyéndose.
 *
 * `accent-soft-foreground` no se calcula por fórmula sino con
 * `colorLegibleSobreClaro`, que es la función que este repo ya usa para
 * garantizar contraste de texto sobre fondo casi blanco.
 */
export function acentoDeEstudio(colorPrimario: string | null | undefined): AcentoStudent {
  const hsl = colorPrimario ? hexToHsl(colorPrimario) : null;
  if (!hsl) return ACENTO_POR_DEFECTO;

  const accent = hslToHex({ h: hsl.h, s: clamp(hsl.s, 18, 70), l: clamp(hsl.l, 26, 42) });
  return {
    accent,
    // El acento es siempre oscuro (L≤42), así que el texto encima es claro.
    accentForeground: '#FFFFFF',
    accentSoft: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.45, 10, 34), l: 93 }),
    accentSoftForeground: colorLegibleSobreClaro(accent),
    accentDeep: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.9, 20, 60), l: 12 }),
    accentDeepForeground: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.35, 8, 26), l: 93 }),
    accentDeepMuted: hslToHex({ h: hsl.h, s: clamp(hsl.s * 0.5, 12, 42), l: 74 }),
  };
}

/**
 * El `<style>` que se inyecta en el layout de servidor. Solo emite los tokens
 * que cambian por estudio: el resto vive en `student.css`, que es estático y
 * cacheable.
 *
 * Se acota a `.student-app` igual que la hoja, para no filtrar el acento del
 * estudio al panel si alguna vez comparten pantalla.
 */
export function acentoCssText(colorPrimario: string | null | undefined): string {
  const a = acentoDeEstudio(colorPrimario);
  return `.student-app{` +
    `--accent:${a.accent};` +
    `--accent-foreground:${a.accentForeground};` +
    `--accent-soft:${a.accentSoft};` +
    `--accent-soft-foreground:${a.accentSoftForeground};` +
    `--accent-deep:${a.accentDeep};` +
    `--accent-deep-foreground:${a.accentDeepForeground};` +
    `--accent-deep-muted:${a.accentDeepMuted};` +
    `}`;
}
