import type { Metadata } from 'next';
import { SeccionHero } from '@/components/landing-v5/SeccionHero';
import { SeccionMartes } from '@/components/landing-v5/SeccionMartes';
import { SeccionSustituciones } from '@/components/landing-v5/SeccionSustituciones';
import { SeccionCalendarioReservas } from '@/components/landing-v5/SeccionCalendarioReservas';
import { SeccionApp } from '@/components/landing-v5/SeccionApp';
import { SeccionWidget } from '@/components/landing-v5/SeccionWidget';
import { SeccionClientas } from '@/components/landing-v5/SeccionClientas';
import { SeccionCambiarse } from '@/components/landing-v5/SeccionCambiarse';
import { SeccionPrecio } from '@/components/landing-v5/SeccionPrecio';
import { SeccionFaq } from '@/components/landing-v5/SeccionFaq';
import { SeccionCtaFinal } from '@/components/landing-v5/SeccionCtaFinal';
import { PageShell } from '@/components/recursos/PageShell';

// Vista previa completa de la landing v5 (11 secciones, port terminado).
//
// Existe para poder MIRAR el port sin tocar la home: la landing es la página
// comercial principal y no debe quedarse a medias en producción ni un minuto.
// Cuando se apruebe, `app/page.tsx` pasa a montar estas secciones y esta ruta
// —junto con su prefijo en PREFIJOS_NO_INDEXABLES— desaparece.
export const metadata: Metadata = {
  title: 'Vista previa · landing v5',
  robots: { index: false, follow: false },
};

export default function LandingV5Preview() {
  return (
    <PageShell>
      <p style={{ background: '#D9C29E', color: '#343825', margin: 0, padding: '10px 20px', fontSize: 13, fontWeight: 700, textAlign: 'center', position: 'relative', zIndex: 70 }}>
        Vista previa del port de la landing v5 — no indexable, no es la home
      </p>
      <SeccionHero />
      <SeccionMartes />
      <SeccionSustituciones />
      <SeccionCalendarioReservas />
      <SeccionApp />
      <SeccionWidget />
      <SeccionClientas />
      <SeccionCambiarse />
      <SeccionPrecio />
      <SeccionFaq />
      <SeccionCtaFinal />
    </PageShell>
  );
}
