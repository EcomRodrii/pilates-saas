'use client';

import { use } from 'react';
import { FichaClienta } from '@/components/clientas/ficha-clienta';

// La ficha vive en un componente (components/clientas/ficha-clienta.tsx) porque
// también se abre al lado de la lista, en pantallas anchas.
export default function DetalleSocio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FichaClienta id={id} modo="pagina" />;
}
