'use client';

// Ruta propia para "Mi perfil" — antes solo vivía como pestaña dentro de
// /configuracion, y esa ruta entera está bloqueada para INSTRUCTOR (whitelist
// de lib/permisos-reglas.ts). El menú de perfil enlazaba ahí para TODOS los
// roles, así que una instructora nunca llegaba a ver el formulario: el
// guardia de app/(dashboard)/layout.tsx la rebotaba a /dashboard antes.
// Gestionar el nombre/email/contraseña propios no es "configuración del
// negocio" — cualquier rol debe poder llegar aquí.

import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import { TabPerfil } from '@/components/configuracion/tab-perfil';
import { TabMiDisponibilidad } from '@/components/mi-perfil/tab-mi-disponibilidad';
import { TabMiAusencia } from '@/components/mi-perfil/tab-mi-ausencia';
import { TabMisEstudios } from '@/components/mi-perfil/tab-mis-estudios';
import { TabInvitacionNetwork } from '@/components/mi-perfil/tab-invitacion-network';
import { useRol } from '@/lib/permisos';

export default function MiPerfilPage() {
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  // Solo la instructora gestiona AQUÍ su propia disponibilidad — el resto de
  // roles la gestiona (la de cualquiera) desde /equipo, que sigue vedado a
  // INSTRUCTOR (lib/permisos-reglas.ts).
  const esInstructor = useRol() === 'INSTRUCTOR';

  return (
    <div className="space-y-6">
      <PageHeader title="Mi perfil" description="Tu nombre, tu foto y cómo accedes a tu cuenta." />
      <TabPerfil showToast={showToast} />
      {esInstructor && <TabMiDisponibilidad showToast={showToast} />}
      {esInstructor && <TabMiAusencia showToast={showToast} />}
      {esInstructor && <TabMisEstudios />}
      {esInstructor && <TabInvitacionNetwork />}
      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
