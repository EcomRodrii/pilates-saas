'use client';

import { Suspense } from 'react';
import { IntegracionesDeTerceros } from '@/components/apps/integraciones-de-terceros';

// «Integraciones de terceros»: la segunda página de «Apps e integraciones».
// `useSearchParams` (la pestaña elegida) pide su Suspense para el build.
export default function IntegracionesPage() {
  return <Suspense><IntegracionesDeTerceros /></Suspense>;
}
