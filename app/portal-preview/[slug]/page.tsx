import { tokenPreviewValido, PlaceholderPreview } from '@/lib/theme/verificar-preview-token';
import { PortalPreviewHomeClient } from '@/components/portal/portal-preview-home-client';

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalPreviewHomePage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  if (!(await tokenPreviewValido(slug, t))) return <PlaceholderPreview />;
  return <PortalPreviewHomeClient />;
}
