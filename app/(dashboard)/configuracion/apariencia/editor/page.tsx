import { redirect } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// EN MANTENIMIENTO (2026-09-07). El editor de marca del portal
// (`ThemeEditorFullscreen`) sigue INTACTO en el repo — no se borra nada, solo
// se cierra la puerta.
//
// Redirige en vez de pintar un aviso propio porque el aviso ya vive en
// `/configuracion/apariencia`: dos pantallas contando lo mismo divergen en
// cuanto una se retoque. Y hace falta que esta ruta también corte, no solo el
// enlace: quien la tuviera guardada en marcadores entraría igual.
//
// PARA REABRIRLO — los cuatro pasos, y no hay más (el cuarto se sumó el
// 2026-09-17, auditoría FE-6: sin él los tres de siempre reabrían el editor
// con la vista previa rota):
//   1. Devolver este fichero a
//      export default function AparienciaEditorPage() { return <ThemeEditorFullscreen />; }
//   2. Quitar el aviso de `/configuracion/apariencia` y volver a enlazar aquí.
//   3. Quitar el `.skip` de los `test.describe` de `e2e/apariencia-*.spec.ts`
//      (5 ficheros, 10 suites). Se saltaron porque entran por esta ruta, no
//      porque estuvieran mal — son lo que demuestra que el editor funciona, y
//      sin ellas se reabriría a ciegas.
//   4. `components/theme/home-preview.tsx` monta el iframe de vista previa en
//      `/portal-preview/${slug}` — ruta que ya no existe (`git ls-files
//      app/portal-preview` → vacío). Antes de reabrir, comprobar a qué ruta
//      se movió la vista previa navegable del portal y actualizar ese `src`;
//      si no, el editor abre pero su iframe central da 404.
// El armazón ya reserva el hueco de pantalla completa para esta ruta exacta
// (`components/layout/dashboard-shell.tsx`), así que no hay nada más que tocar.
// ─────────────────────────────────────────────────────────────────────────────
export default function AparienciaEditorPage() {
  redirect('/configuracion/apariencia');
}
