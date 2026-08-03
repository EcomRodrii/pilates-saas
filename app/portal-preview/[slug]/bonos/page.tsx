import { tokenPreviewValido, PlaceholderPreview } from '@/lib/theme/verificar-preview-token';
import { PortalPreviewBonosClient } from '@/components/portal/portal-preview-bonos-client';

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalPreviewBonosPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  if (!(await tokenPreviewValido(slug, t))) return <PlaceholderPreview />;
  return <PortalPreviewBonosClient />;
}
