// Ilustraciones externas (las que manda el fundador o su diseñadora) que sustituyen a las dibujadas en
// código. Un archivo `public/ilustraciones/<clave>.<ext>` pasa a usarse en cuanto su clave se añade aquí:
//   · `vacio-<escena>`   → estados vacíos (`components/ilustraciones/escenas.tsx`), proporción 4:3 (200 × 150);
//   · `paso-<id>`        → tarjetas de «Pon en marcha tu estudio» (`components/ilustraciones/pasos.tsx`), 286 × 140.
// Una clave sin archivo da una imagen rota, así que SOLO se añade con el archivo ya subido.
// Lista de huecos y encargo completo: docs/diseno/ilustraciones/LEEME.md.
export const ILUSTRACIONES_EXTERNAS: Readonly<Record<string, 'svg' | 'webp'>> = {
  'vacio-grafico': 'webp',
  'vacio-agenda': 'webp',
  'vacio-personas': 'webp',
  'vacio-busqueda': 'webp',
  'vacio-cobros': 'webp',
  'vacio-sinDatos': 'webp',
  'vacio-relleno': 'webp',
  'vacio-notificaciones': 'webp',
  'vacio-automatizaciones': 'webp',
  'vacio-festivos': 'webp',
  'vacio-comunidad': 'webp',
  'vacio-error': 'webp',
  'vacio-conexion': 'webp',
  'vacio-permisos': 'webp',
  'vacio-resenas': 'webp',
  'vacio-productos': 'webp',
  'vacio-integraciones': 'webp',
  'paso-cuenta': 'webp',
  'paso-primera-clase': 'webp',
  'paso-compartir': 'webp',
  'paso-alumnas': 'webp',
  'paso-primera-reserva': 'webp',
  'paso-stripe': 'webp',
  'paso-marca': 'webp',
  'paso-fiscales': 'webp',
  'paso-equipo': 'webp',
  'paso-salas': 'webp',
  'paso-instructor': 'webp',
  'paso-clase': 'webp',
  'paso-horario': 'webp',
  'paso-bonos': 'webp',
  'paso-clientes': 'webp',
  'paso-reservas': 'webp',
};

export const rutaIlustracion = (clave: string): string | null =>
  Object.hasOwn(ILUSTRACIONES_EXTERNAS, clave) ? `/ilustraciones/${clave}.${ILUSTRACIONES_EXTERNAS[clave]}` : null;
