import { redirect } from 'next/navigation';

// CONGELADO — cola de verificaciones de Tentare Network (2-oct-2026). La
// página real está intacta en ./page.frozen.tsx. Reactivar: renombrarla a
// page.tsx (borrando este stub) y quitar el prefijo de RUTAS_CONGELADAS.
export default function Page() {
  redirect('/equipo');
}
