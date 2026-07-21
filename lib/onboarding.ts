// Lógica pura del checklist de "Primeros pasos" — separada del componente
// para poder testearla sin montar React ni useStudio(). Cada "done" se
// calcula a partir de datos reales del estudio, nunca se marca a mano.

export interface DatosOnboarding {
  nif: string | null | undefined;
  stripeAccountId: string | null | undefined;
  slug: string | null | undefined;
  numInstructores: number;
  numTiposClase: number;
  numSesiones: number;
  numSocios: number;
}

export interface PasoOnboarding {
  id: string;
  label: string;
  done: boolean;
  href: string;
  /** Solo el paso final: abre la página pública en pestaña nueva. */
  externo?: boolean;
}

/**
 * Los siete pasos, en el orden del documento de producto. "Abre las
 * reservas" no tiene una señal propia — no existe (ni se ha construido aquí)
 * un interruptor de "publicar"— así que se marca hecho cuando los seis
 * anteriores lo están: es la consecuencia de tenerlo todo listo, no un paso
 * más que marcar a mano.
 */
export function calcularPasosOnboarding(d: DatosOnboarding): PasoOnboarding[] {
  const base: PasoOnboarding[] = [
    { id: 'estudio', label: 'Configura tu estudio', done: !!d.nif, href: '/configuracion?tab=estudio' },
    { id: 'instructor', label: 'Añade tu primer instructor', done: d.numInstructores > 0, href: '/equipo' },
    { id: 'clase', label: 'Crea tu primera clase', done: d.numTiposClase > 0, href: '/configuracion?tab=clases' },
    { id: 'horario', label: 'Configura tus horarios', done: d.numSesiones > 0, href: '/calendario' },
    { id: 'clientes', label: 'Añade tus primeros clientes', done: d.numSocios > 0, href: '/clientas?nuevo=1' },
    { id: 'pago', label: 'Activa los métodos de pago', done: !!d.stripeAccountId, href: '/configuracion?tab=integraciones' },
  ];
  const listo = base.every(p => p.done);
  const reservas: PasoOnboarding = {
    id: 'reservas',
    label: 'Abre las reservas',
    done: listo,
    href: d.slug ? `/reservar/${d.slug}` : '/configuracion?tab=estudio',
    externo: listo,
  };
  return [...base, reservas];
}
