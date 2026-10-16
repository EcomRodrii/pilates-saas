'use client';

import { useCallback } from 'react';
import { HerramientaWidgets } from '@/components/configuracion/herramientas/herramienta-widgets';
import { Toast, useToast, type MostrarToast } from '@/components/ui/toast';

export function TuWeb() {
  const { message, variant, show, showError, dismiss } = useToast();
  // Como en Configuración: un `{ variant: 'error' }` se tiene que VER como error.
  const showToast: MostrarToast = useCallback(
    (mensaje, opciones) => { if (opciones?.variant === 'error') showError(mensaje); else show(mensaje); },
    [show, showError],
  );
  return (
    <>
      <HerramientaWidgets showToast={showToast} />
      {message && <Toast message={message} variant={variant} onDismiss={dismiss} />}
    </>
  );
}
