import { redirect } from 'next/navigation';
import { RUTAS_ANTIGUAS } from '@/lib/configuracion/destino';

// «Notificaciones» es hoy «Mis avisos», una sección de Configuración con el
// mismo componente y la misma escritura (secciones/seccion-avisos.tsx). Esta
// pantalla no la enlazaba nadie, pero puede estar en un marcador: redirige.
export default function ConfiguracionNotificacionesPage() {
  redirect(RUTAS_ANTIGUAS['/configuracion/notificaciones']);
}
