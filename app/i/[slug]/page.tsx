// Ver app/i/[slug]/layout.tsx — mismo motivo, reexporta la página de
// /reservar/[slug] tal cual (lee el slug con useParams(), no del path
// literal del fichero, así que resuelve bien bajo esta ruta también).
export { default } from '@/app/reservar/[slug]/page';
