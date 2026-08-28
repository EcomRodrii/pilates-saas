import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        El calendario de reservas incrustado en tu propia web no aparece, se queda en blanco, o no se adapta bien al
        tamaño de la pantalla.
      </QueEstaPasando>

      <CausasComunes items={[
        'El código del widget se ha pegado incompleto o en el sitio equivocado de tu página.',
        'Un bloqueador de scripts o un plugin de "optimización" de tu web retrasa o bloquea el script de Tentare.',
        'Se ha usado un slug de estudio equivocado en el código.',
        'La caché de tu web (muy común en WordPress) sigue sirviendo una versión antigua de la página, de antes de instalarlo.',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>Revisa que el fragmento de código está completo y sin cortar — un solo carácter que falte puede impedir que cargue.</p>
        <p style={{ margin: '0 0 12px' }}>Vacía la caché de tu web (o del plugin de caché, si usas WordPress) y recarga con caché del navegador también vacía.</p>
        <p style={{ margin: 0 }}>Prueba la página en una pestaña de incógnito, sin extensiones — si ahí carga bien, el problema es un bloqueador o plugin de tu navegador, no el widget.</p>
      </ComoSolucionarlo>

      <AyudaResultado>
        Si nada de esto lo soluciona, revisa la instalación paso a paso en{' '}
        <Link href="/ayuda/widget/instalar-con-html" style={{ color: 'inherit', textDecoration: 'underline' }}>instalar el widget con HTML o iframe</Link>.
      </AyudaResultado>
    </>
  );
}
