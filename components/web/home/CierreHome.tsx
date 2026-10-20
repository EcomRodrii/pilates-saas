import Link from 'next/link';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { ALTA, HEROE_CAMBIARSE } from '@/components/landing/enlaces';
import { FOTOS } from '@/components/landing/fotos';
import { FotoLanding } from '@/components/landing/FotoLanding';

// La banda final (fase 2.2): banda oscura a sangre con la foto de una sala,
// apagada y teñida de oliva con el mismo tratamiento uniforme que el héroe (sin
// degradados), y encima el titular en blanco y el botón (la forma del cierre de
// Mariana Tek y de la banda sobre foto de bsport). La página abre y cierra igual.
//
// `data-cta-final`: PopupEmpezar no interrumpe a quien ya lo tiene a la vista, y
// MedicionLanding cuenta sus clics como `cta_final`.

const MEDIA_APILADO = '(max-width: 760px)';

export function CierreHome() {
  return (
    <section className="wh-cierre wh-oscura" aria-labelledby="wh-cierre-h" data-cta-final>
      <div className="wh-cierre-foto">
        <FotoLanding foto={FOTOS.cierre} mediaMovil={MEDIA_APILADO} sizes={{ escritorio: '100vw', movil: '100vw' }} />
      </div>
      <div className="wh-cierre-cuerpo">
        <h2 id="wh-cierre-h" className="wh-h2">Tu estudio, bajo control desde hoy.</h2>
        <p className="wh-lead">Empieza gratis, sin tarjeta. Tu horario y tu página de reservas, listos en tu primera sesión. Y si no te convence, te llevas tus datos.</p>
        <div className="wh-cierre-acciones">
          <Link href={ALTA} className="wh-boton wh-boton-arena wh-cierre-boton">{CTA_ALTA}</Link>
          <Link href={HEROE_CAMBIARSE.href} className="wh-boton wh-boton-contorno-claro">{HEROE_CAMBIARSE.label}</Link>
        </div>
      </div>
    </section>
  );
}
