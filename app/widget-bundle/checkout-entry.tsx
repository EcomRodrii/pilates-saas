// Punto de entrada del bundle de checkout diferido (Modo B) — ver el docblock
// de components/checkout-widget/checkout-lazy-mount.tsx para el porqué.
// Compilado a public/widget-checkout.js (scripts/build-widget-bundle.mjs),
// SOLO pedido por `widget.js` vía `import()` cuando la visitante abre
// "Planes" — nunca en la carga inicial del widget.
export { mountListaPlanes, unmountListaPlanes } from '@/components/checkout-widget/checkout-lazy-mount';
