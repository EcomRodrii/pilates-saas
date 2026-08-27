'use client';

import { PortalPerfilView } from './portal-perfil-view';
import { SESION_MUESTRA, SOCIO_MUESTRA } from '@/lib/theme/preview-sesion-muestra';

// `navegar`/`onLogout` son no-op: /compras (dinero real) y /preferencias no
// existen bajo /portal-preview, y no hay sesión real que cerrar — mismo
// criterio que Bonos (navegar() no-op hacia rutas que no existen aquí).
export function PortalPreviewPerfilClient() {
  return (
    <PortalPerfilView
      session={SESION_MUESTRA}
      socioOverride={SOCIO_MUESTRA}
      escribible={false}
      navegar={() => {}}
      onLogout={() => {}}
    />
  );
}
