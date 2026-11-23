# Animaciones del admin de Shopify, medidas en vivo (23-nov-2026)

Medidas, no código: salen de `document.getAnimations()` y de las variables CSS de la página `admin.shopify.com/store/<tienda>` (una tienda
de prueba del fundador), muestreando cada 60 ms durante la carga del Inicio. No se copia nada de su JS ni de sus hojas de estilo: son los
valores de movimiento que Tentare reproduce a mano.

## Variables de movimiento y de menú (`--nav-*`)

| Variable | Valor |
|---|---|
| `--nav-ease` | `cubic-bezier(.2, .8, 0, 1)` |
| `--nav-enter-duration` | `400ms` |
| `--nav-stagger-step` | `10ms` |
| `--nav-expanded-inline-size` | `13.75rem` (220 px) |
| `--nav-condensed-inline-size` | `3.75rem` (60 px) |
| `--nav-pill-radius` | `.8125rem` (13 px) |
| `--mobile-nav-reveal-motion` | `400ms cubic-bezier(.2, .8, 0, 1)` |
| `--mobile-nav-width` | `min(22.5rem, 88vi)` |

## Entrada del Inicio al cargar (orden de aparición)

- **Fondo del menú:** `background-color rgb(10,10,10) → transparente`, 300 ms, `cubic-bezier(.2, 0, 0, 1)`.
- **Filas del menú:** `translate -60px 0 → 0`, `opacity 0 → 1`, `filter blur(2px) → none`; 400 ms, `cubic-bezier(.2,.8,0,1)`; retraso `i × 10 ms`.
- **Pie del menú (Configuración, la tienda):** `translate 0 60px → 0`, mismo fundido y desenfoque; retrasos 0 y 10 ms.
- **Grupo «Canales de ventas» y sus filas:** `translate -4px → 0`, 400 ms, retrasos 0–30 ms.
- **Botones de la barra superior:** `scale .75 → 1`, `opacity 0 → .7`, `blur(2px) → none`; 400 ms, misma curva.
- **Compositor del Inicio:** `opacity 0 → 1`, 400 ms, `cubic-bezier(.25,.1,.25,1)`, retraso 200 ms.
- **Banda de resplandor del pie:** `translateY(60px) blur(2px) opacity 0 → none`, 400 ms, retraso 1500 ms.

## Qué hace Tentare con esto

- Menú: `shell-menu-fila` y `shell-menu-pie` en `app/globals.css`, activados una vez por carga (`data-entra`, `components/layout/sidebar.tsx`).
- Bienvenida del Inicio: `components/dashboard/bienvenida-inicio.tsx` (sobre el vídeo del fundador).
- Ampliar y reducir el menú: la transición de vista de #2955, con `--motion-ventana: 400ms` y `--motion-ease-ventana`.
