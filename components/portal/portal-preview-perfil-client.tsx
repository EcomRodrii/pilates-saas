'use client';

import { PortalPerfilView } from './portal-perfil-view';
import { SESION_MUESTRA, SOCIO_MUESTRA } from '@/lib/theme/preview-sesion-muestra';
import { useVistaPreviaKit } from './vista-previa-kit';

// `navegar`/`onLogout` son no-op: /compras (dinero real) y /preferencias no
// existen bajo /portal-preview, y no hay sesión real que cerrar — mismo
// criterio que Bonos (navegar() no-op hacia rutas que no existen aquí).
export function PortalPreviewPerfilClient() {
  // Con un tema del kit se enseña el kit, no el portal de siempre.
  const kit = useVistaPreviaKit('perfil');
  if (kit) return kit;
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
