import { PortalRaiz } from '@/components/portal/portal-raiz';

// ⚠️ Antes esto era un `redirect()` a /acceso en el servidor. Sigue acabando
// ahí —quien comparte este enlace pelado por WhatsApp no sabe si quien lo
// recibe tiene contraseña, y /acceso funciona igual para las dos—, pero ahora
// pasando por la BIENVENIDA del tema, que es la primera impresión que diseñó el
// kit y que el portal real no llegaba a montar nunca.
//
// Quien SÍ tiene sesión no la ve: `PortalShell` la salta directa a /home.
export default async function PortalRoot({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PortalRaiz slug={slug} />;
}
