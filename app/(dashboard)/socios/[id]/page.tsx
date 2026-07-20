'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// La ficha de una clienta vive ahora en /clientas/[id].
export default function RedireccionSocioId() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  useEffect(() => {
    router.replace(`/clientas/${params.id}`);
  }, [router, params.id]);
  return null;
}
