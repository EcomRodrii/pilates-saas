// Ilustraciones externas (las que manda el fundador o su diseñadora) que sustituyen a las dibujadas en
// código. Un archivo `public/ilustraciones/<clave>.svg` pasa a usarse en cuanto su clave se añade aquí:
//   · `vacio-<escena>`   → estados vacíos (`components/ilustraciones/escenas.tsx`), lienzo 200 × 150;
//   · `paso-<id>`        → tarjetas de «Pon en marcha tu estudio» (`components/ilustraciones/pasos.tsx`), 286 × 140.
// Una clave sin archivo da una imagen rota, así que SOLO se añade con el archivo ya subido.
// Lista de huecos y encargo completo: docs/diseno/ilustraciones/LEEME.md.
export const ILUSTRACIONES_EXTERNAS: ReadonlySet<string> = new Set<string>([
  // 'vacio-agenda',
]);

export const rutaIlustracion = (clave: string): string | null =>
  ILUSTRACIONES_EXTERNAS.has(clave) ? `/ilustraciones/${clave}.svg` : null;
