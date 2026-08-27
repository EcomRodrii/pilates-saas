'use client';

// «Mi centro» — ruta heredada del kit de temas (ya retirado). Se queda como
// un simple redirect a Inicio, igual que `/videos` con VOD congelado.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';

export default function CentroPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { dataLoaded } = useStudio();

  useEffect(() => {
    if (dataLoaded) router.replace(`/portal/${slug}/home`);
  }, [dataLoaded, router, slug]);

  return null;
}
