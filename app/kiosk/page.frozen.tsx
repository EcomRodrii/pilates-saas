import { redirect } from 'next/navigation';

// Compatibilidad con enlaces antiguos (sin slug) guardados antes de la
// migración a rutas multi-negocio: redirige al negocio por defecto.
export default function KioskRoot() {
  redirect('/kiosk/tentare');
}
