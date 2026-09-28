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
        'Pusiste el horario «sin marco» (la integración nativa) y tu web todavía no está autorizada en Configuración > Mi app y mi web > Widgets para tu web, en el paso «Ponlo en tu web», dentro de «Para quien te hace la web» — esa forma, a diferencia del resto, lo exige antes de funcionar.',
        'Usas «Un botón que se abre encima» y tu web no ejecuta la línea <script> del código (algunos constructores de páginas no lo hacen dentro de un bloque): pégala en el pie global de tu web.',
        'Un bloqueador de scripts o un plugin de "optimización" de tu web retrasa o bloquea el script de Tentare.',
        'La caché de tu web (muy común en WordPress) sigue sirviendo una versión antigua de la página, de antes de instalarlo.',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>Si lo copiaste desde Widgets para tu web, vuelve allí: en «Lo que tienes en tu web» verás cuándo lo vimos por última vez en tu web. Que aún no salga no quiere decir que esté mal pegado. Si lo copiaste desde allí con su nombre para tus estadísticas y va dentro de una página, en una ventana que se abre encima o sin marco, aparece en cuanto alguien lo abre en tu web. Si lo copiaste sin ese nombre, no vemos dónde está. De un botón que lleva a tu página de reservas o de un enlace no vemos desde dónde llegan, solo cuántas visitas.</p>
        <p style={{ margin: '0 0 12px' }}>Si lo pusiste sin marco, ve a Configuración &gt; Mi app y mi web &gt; Widgets para tu web, paso «Ponlo en tu web», abre «Para quien te hace la web» y comprueba que tu web está entre las autorizadas (con «www» y sin él) — es el motivo más común con esa forma en concreto.</p>
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
