import { redirect } from 'next/navigation';

// A /acceso, no a /login: quien comparte este enlace pelado (de palabra, por
// WhatsApp) no sabe si quien lo recibe ya tiene contraseña — /acceso solo pide
// el email y manda un enlace, funciona lo mismo para alguien sin cuenta que
// para quien la olvidó. Quien SÍ tiene sesión activa nunca ve esta pantalla:
// PortalShell la salta directa a /home (ver isLoginPage en portal-shell.tsx).
export default async function PortalRoot({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/portal/${slug}/acceso`);
}
