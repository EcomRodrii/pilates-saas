'use client';

// Store de dominio: Notas de progreso de la socia (Fase B).
// Autocontenido.

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId, dbInsertNotaProgreso } from '@/lib/supabase-data';
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
    dbInsertNotaProgreso(nueva);
  }

  return { notasProgreso, setNotasProgreso, addNotaProgreso };
}
