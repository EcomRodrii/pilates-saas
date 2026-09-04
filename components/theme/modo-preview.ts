// `ModoPreview` vivía en `components/portal/portal-preview-bridge.ts`, que se
// fue al borrar el portal de la alumna. Es un tipo de DOS palabras y lo usa el
// editor de temas del panel, que sigue vivo: se queda aquí, en su casa, en vez
// de sobrevivir como resto de una carpeta que ya no existe.
export type ModoPreview = 'editar' | 'navegar';
