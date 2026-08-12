import type { Metadata } from 'next';
import { SeccionSustituciones } from '@/components/landing-v5/SeccionSustituciones';
import { SeccionCalendarioReservas } from '@/components/landing-v5/SeccionCalendarioReservas';
import { SeccionApp } from '@/components/landing-v5/SeccionApp';
import { SeccionWidget } from '@/components/landing-v5/SeccionWidget';
import { PageShell } from '@/components/recursos/PageShell';

// Vista previa de la landing v5, que se está portando por secciones.
//
// Existe para poder MIRAR el port sin tocar la home: la landing es la página
// comercial principal y no debe quedarse a medias en producción ni un minuto.
// Cuando estén todas las secciones, `app/page.tsx` pasa a montarlas y esta
// ruta —junto con su prefijo en PREFIJOS_NO_INDEXABLES— desaparece.
export const metadata: Metadata = {
  title: 'Vista previa · landing v5',
  robots: { index: false, follow: false },
};

export default function LandingV5Preview() {
  return (
    <PageShell>
      <p style={{ background: '#D9C29E', color: '#343825', margin: 0, padding: '10px 20px', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
        Vista previa del port de la landing v5 — no indexable, no es la home
      </p>
      <SeccionSustituciones />
      <SeccionCalendarioReservas />
      <SeccionApp />
      <SeccionWidget />
    </PageShell>
  );
}
