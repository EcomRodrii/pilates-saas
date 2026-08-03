import { tokenPreviewValido, PlaceholderPreview } from '@/lib/theme/verificar-preview-token';
import { PortalPreviewClasesClient } from '@/components/portal/portal-preview-clases-client';

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalPreviewClasesPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  if (!(await tokenPreviewValido(slug, t))) return <PlaceholderPreview />;
  return <PortalPreviewClasesClient />;
}
