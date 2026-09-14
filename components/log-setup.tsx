'use client';

import { useEffect } from 'react';
import { setupLogStripping } from '@/lib/logger';

/**
 * Configura el stripping de logs en cliente.
 * Se monta en el root layout para ejecutarse lo antes posible.
 * No renderiza nada — solo efecto.
 */
export function LogSetup() {
  useEffect(() => {
    setupLogStripping();
  }, []);

  return null;
}
