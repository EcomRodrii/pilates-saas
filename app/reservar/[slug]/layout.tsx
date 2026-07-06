import { StudioSlugGate } from '@/components/studio-slug-gate';

export default async function ReservarSlugLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StudioSlugGate slug={slug}>{children}</StudioSlugGate>;
}
