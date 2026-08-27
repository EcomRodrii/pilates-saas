import { redirect } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// RETIRADO (decisión del fundador, 2026-08-27): esta pantalla era la BIBLIOTECA
// de temas (`ThemeLibrary`, componente ahora borrado) — se elegía un tema del
// kit mirándolo, y "Personalizar" llevaba al ajuste fino en
// `/configuracion/apariencia/editor`. Con el sistema de temas del kit
// retirado por completo (PR 2 de "borrar temas del kit": árbol de
// `components/portal-tema/`, los 5 `themes/*`, la galería), ya no hay nada
// que elegir de un vistazo — solo queda el editor. Este stub manda
// directamente ahí en vez de dejar una pantalla vacía.
// ─────────────────────────────────────────────────────────────────────────────
export default function AparienciaPage() {
  redirect('/configuracion/apariencia/editor');
}
