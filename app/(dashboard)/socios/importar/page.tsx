'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedireccionImportarSocios() {
  const router = useRouter();
  useEffect(() => { router.replace('/clientas/importar'); }, [router]);
  return null;
}
