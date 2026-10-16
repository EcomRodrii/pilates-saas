// Los valores de serie de `student.css` (el tema de la app de la alumna antes de que
// cada estudio ponga el suyo) que necesitan sus piezas cuando se pintan FUERA de la
// app: la vista previa de «Contenido de tu app» en el panel pinta la `Tarjeta` y la
// `FranjaMensaje` de verdad, y cargar la hoja de la app en el panel la aplicaría a todo
// `.student-app`. Son la marca blanca de la app, no colores del panel.
// ⚠️ Si cambian en `student.css`, cambian aquí: lo vigila lib/student/variables-app.test.ts.

export const VARIABLES_APP = {
  '--background': '#FAF9F5',
  '--foreground': '#1A1A1A',
  '--card': '#FFFFFF',
  '--border': '#E5E3DA',
  '--muted-foreground': '#5A5A52',
  '--subtle-foreground': '#6C7567',
  '--on-dark': '#FAF9F5',
  '--radius-card': '16px',
  '--radius-sheet': '24px',
  '--shadow-card': '0 10px 24px -10px rgba(26,26,26,.14)',
} as const;
