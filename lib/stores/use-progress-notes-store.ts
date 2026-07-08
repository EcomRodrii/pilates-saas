'use client';

// Store de dominio: Notas de progreso de la socia (Fase B).
// Autocontenido. NOTA (deuda preexistente preservada): addNotaProgreso NO
// persiste en BD — opera solo en memoria, igual que antes de la extracción.

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId } from '@/lib/supabase-data';
import type { NotaProgreso } from '@/lib/types';

export function useProgressNotesStore() {
  const [notasProgreso, setNotasProgreso] = useState<NotaProgreso[]>([]);

  function addNotaProgreso(nota: Omit<NotaProgreso, 'id' | 'studioId' | 'creadaEn'>) {
    const nueva: NotaProgreso = {
      id: `nota-prog-${uid()}`,
      studioId: getCurrentStudioId(),
      creadaEn: new Date().toISOString(),
      ...nota,
    };
    setNotasProgreso(prev => [nueva, ...prev]);
  }

  return { notasProgreso, setNotasProgreso, addNotaProgreso };
}
