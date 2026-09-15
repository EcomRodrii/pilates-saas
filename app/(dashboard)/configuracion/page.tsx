'use client';

import { ConfigShell } from '@/components/configuracion/shell/config-shell';

// Configuración por preguntas: la lista de secciones, la URL y el foco viven en
// el shell; las secciones, en components/configuracion/secciones/; y qué hay en
// cada una, en lib/configuracion/secciones.ts.
export default function ConfiguracionPage() {
  return <ConfigShell />;
}
