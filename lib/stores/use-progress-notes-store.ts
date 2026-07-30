'use client';

// Store de dominio: Notas de progreso de la socia (Fase B).
// Autocontenido.

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId, dbInsertNotaProgreso } from '@/lib/supabase-data';
import type { NotaProgreso } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';

export function useProgressNotesStore() {
  const [notasProgreso, setNotasProgreso] = useState<NotaProgreso[]>([]);

  // Espera a que la BD confirme antes de darla por guardada — antes se
  // pintaba al instante y el insert iba sin await: si fallaba, la nota
  // desaparecía sin avisar a la próxima recarga (mismo patrón de bug que
  // "reserva decía que sí y era que no").
  async function addNotaProgreso(nota: Omit<NotaProgreso, 'id' | 'studioId' | 'creadaEn'>): Promise<ResultadoEscritura> {
    const nueva: NotaProgreso = {
      id: `nota-prog-${uid()}`,
      studioId: getCurrentStudioId(),
      creadaEn: new Date().toISOString(),
      ...nota,
    };
    const res = await dbInsertNotaProgreso(nueva);
    if (res.ok) setNotasProgreso(prev => [nueva, ...prev]);
    return res;
  }

  return { notasProgreso, setNotasProgreso, addNotaProgreso };
}
