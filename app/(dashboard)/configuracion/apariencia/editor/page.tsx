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
// PARA REABRIRLO: devolver este fichero a
//   export default function AparienciaEditorPage() { return <ThemeEditorFullscreen />; }
// y quitar el aviso de `/configuracion/apariencia`. El armazón ya reserva el
// hueco de pantalla completa para esta ruta exacta
// (`components/layout/dashboard-shell.tsx`), así que no hay nada más que tocar.
// ─────────────────────────────────────────────────────────────────────────────
export default function AparienciaEditorPage() {
  redirect('/configuracion/apariencia');
}
