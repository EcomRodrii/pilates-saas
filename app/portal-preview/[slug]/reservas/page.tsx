import { tokenPreviewValido, PlaceholderPreview } from '@/lib/theme/verificar-preview-token';
import { PortalPreviewReservasClient } from '@/components/portal/portal-preview-reservas-client';

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalPreviewReservasPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  if (!(await tokenPreviewValido(slug, t))) return <PlaceholderPreview />;
  return <PortalPreviewReservasClient />;
}
