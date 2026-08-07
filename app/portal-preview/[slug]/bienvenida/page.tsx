import { tokenPreviewValido, PlaceholderPreview } from '@/lib/theme/verificar-preview-token';
import { PortalPreviewBienvenidaClient } from '@/components/portal/portal-preview-bienvenida-client';

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalPreviewBienvenidaPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  if (!(await tokenPreviewValido(slug, t))) return <PlaceholderPreview />;
  return <PortalPreviewBienvenidaClient />;
}
