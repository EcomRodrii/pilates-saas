// ─────────────────────────────────────────────────────────────────────────────
// Auditoría de rendimiento (2026-08-31, `tentare-performance`): `<ListaPlanes>`
// (y con ella `@stripe/stripe-js`/`@stripe/react-stripe-js`, ~127KB
// comprimidos medidos con `gzip -9` sobre `public/widget.js`) se importaba de
// forma EAGER en el punto de entrada del bundle embebible (Modo B,
// `app/widget-bundle/main.tsx`) — todo estudio que incrusta el widget
// descargaba y parseaba el código de pago aunque nunca venda un plan online.
//
// Este fichero es el puente entre las DOS piezas independientes:
//   1. `public/widget.js` — el script que el estudio incrusta. Sigue siendo
//      UN SOLO fichero, sin cambiar nada del snippet ya pegado en webs reales
//      (elchefreal.com incluida) — esa promesa de "un script, cero
//      configuración" no se toca.
//   2. `public/widget-checkout.js` — build SEPARADO (mismo esbuild, ver
//      scripts/build-widget-bundle.mjs), con su PROPIA copia de React/
//      ReactDOM. `widget.js` lo pide con `import()` NATIVO (ESM dinámico,
//      soportado en scripts clásicos desde hace años, no hace falta
//      `type="module"` en el `<script>` del estudio) SOLO cuando la
//      visitante abre "Planes" — nunca antes.
//
// ⚠️ Por qué DOS copias de React en vez de compartir una: `widget.js` es un
// único IIFE autocontenido (bundle:true, sin `splitting`, que esbuild solo
// soporta en formato `esm`) — no expone su copia de React como global. Se
// intentó evitarlo así porque compartir React entre dos árboles montados por
// separado con `createRoot` distintos NO da ningún problema real (son dos
// raíces independientes, nunca el mismo árbol de fibra) — la única forma de
// COMPARTIRLA de verdad exigiría exponer `window.React`/`window.ReactDOM`
// desde `widget.js` y marcarlos `external` en el segundo build, con un mapa
// de alias — más superficie de fallo en el camino de pago para ahorrar ~40KB
// que la visitante NUNCA paga si no llega a abrir "Planes". No compensa.
import { createRoot, type Root } from 'react-dom/client';
import { StrictMode } from 'react';
import { ListaPlanes } from './lista-planes';
import type { ModoTokens } from '@/lib/portal-modo';
import type { PlanTarifa } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';

export interface PropsListaPlanesLazy {
  t: ModoTokens;
  planes: PlanTarifa[];
  socioId: string | null;
  publishableKey: string;
  stripeAccountId: string | null;
  onCrearIntento: (plan: PlanTarifa) => Promise<(ResultadoEscritura & { datos?: unknown }) | undefined>;
  onBizum: (plan: PlanTarifa) => void;
  onCerrar: () => void;
  onComprado?: () => void;
  onIniciarSesion?: () => void;
}

// Una raíz por contenedor — `main.tsx` reutiliza el MISMO nodo DOM cada vez
// que se abre "Planes" (no lo recrea), así que hace falta recordar la raíz
// ya creada en vez de llamar `createRoot` dos veces sobre el mismo nodo
// (React avisa por consola y puede perder estado si se hace).
const raicesPorContenedor = new WeakMap<Element, Root>();

export function mountListaPlanes(contenedor: Element, props: PropsListaPlanesLazy) {
  let raiz = raicesPorContenedor.get(contenedor);
  if (!raiz) {
    raiz = createRoot(contenedor);
    raicesPorContenedor.set(contenedor, raiz);
  }
  raiz.render(
    <StrictMode>
      <ListaPlanes {...props} />
    </StrictMode>,
  );
}

export function unmountListaPlanes(contenedor: Element) {
  const raiz = raicesPorContenedor.get(contenedor);
  if (!raiz) return;
  raiz.unmount();
  raicesPorContenedor.delete(contenedor);
}
