'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedireccionImportarMembresias() {
  const router = useRouter();
  useEffect(() => { router.replace('/clientas/importar/membresias'); }, [router]);
  return null;
}
