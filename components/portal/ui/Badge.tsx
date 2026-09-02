import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral';

// Un componente para las 7 implementaciones de "badge de estado" que existían
// sueltas (ESTADO_BADGE en reservas, ESTADO_STYLE en progreso, diccionarios
// inline en clases/mi-plan/home...), cada una con su propio diccionario de
// colores repetido.
//
// ⚠️ COLOR Y FORMA SALEN DE `app/portal/[slug]/portal-app.css` (`--ap-*`), no
// de `useModo()`/`portal-tokens`. Antes este componente era la vía por la que
// el sistema de tokens VIEJO se colaba dentro de páginas ya migradas al
// literal (documentos, compañeras): la página pintaba con `--ap-*` y el badge
// de dentro con los neutros del tema, y no cuadraban. Al no leer `useModo()`
// ya no necesita ser cliente.
//
// Los cuatro pares replican `.ap-badge--ok/pocas/llena` del kit y la pill
// neutra; el tamaño (10px/800, 5px 10px, radio 999) es el de `.ap-badge`.
// Sin `textTransform: uppercase`: en las 20 capturas de referencia los badges
// van en caja normal ("5 plazas", "Llena · lista", "activa"), nunca en
// versalitas.
const COLORES: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: 'var(--ap-verde-suave)', fg: 'var(--ap-verde-tinta)' },
  warning: { bg: 'var(--ap-ambar-suave)', fg: 'var(--ap-ambar-tinta)' },
  danger: { bg: 'var(--ap-rojo-suave)', fg: '#A04A3C' },
  neutral: { bg: 'var(--ap-pill)', fg: 'var(--ap-sec)' },
};

export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const c = COLORES[variant];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800,
        padding: '5px 10px', borderRadius: 999,
        background: c.bg, color: c.fg, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
