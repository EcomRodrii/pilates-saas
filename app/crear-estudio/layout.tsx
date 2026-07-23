import { redirect } from 'next/navigation';

// Alta de estudios en pausa (pre-lanzamiento): cualquier acceso directo a esta
// ruta redirige a la lista de espera de la landing. El formulario en
// page.tsx se deja intacto para reactivarlo cuando se abra el alta pública.
export default function CrearEstudioLayout() {
  redirect('/#lista-espera');
}
