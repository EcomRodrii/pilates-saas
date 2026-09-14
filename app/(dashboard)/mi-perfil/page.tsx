'use client';

// Ruta propia para "Mi perfil" — antes solo vivía como pestaña dentro de
// /configuracion, que está bloqueada para varios roles. Gestionar el
// nombre/email/contraseña propios no es "configuración del negocio": cualquier
// rol del panel debe poder llegar aquí.
//
// La instructora ya no: Tentare Core se retiró (14-sep-2026) y su perfil,
// disponibilidad, ausencias y estudios están en la app del estudio.

import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import { TabPerfil } from '@/components/configuracion/tab-perfil';

export default function MiPerfilPage() {
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();

  return (
    <div className="space-y-6">
      <PageHeader title="Mi perfil" description="Tu nombre, tu foto y cómo accedes a tu cuenta." />
      <TabPerfil showToast={showToast} />
      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
