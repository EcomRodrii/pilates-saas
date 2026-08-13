// Enlace público de instructora freelance (feature #9, ficha Lorari-vs-Tentare).
// Reexporta el layout de /reservar/[slug] TAL CUAL — una cuenta freelance ES
// un `studios` real de un solo miembro (studios.tipo_cuenta='FREELANCE'), así
// que su `slug` YA es su identificador personal (generado desde su nombre al
// darse de alta, no el de un negocio) y el motor entero (gate de página
// oculta, metadata, StudioSlugGate, tema) sirve sin cambios — evita duplicar
// ~2400 líneas de page.tsx para una diferencia que es solo de URL.
export { generateMetadata, default } from '@/app/reservar/[slug]/layout';
