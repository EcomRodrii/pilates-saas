import { Suspense } from 'react';
import { GuiaPasoAPaso } from '@/components/guia/guia-paso-a-paso';

// La guía paso a paso de puesta en marcha (20-nov-2026, docs/guia-puesta-en-marcha.md).
export default function PuestaEnMarchaPage() {
  return (
    <Suspense fallback={null}>
      <GuiaPasoAPaso />
    </Suspense>
  );
}
