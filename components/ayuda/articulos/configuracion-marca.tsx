import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        El color y el logo de tu estudio se configuran en Configuración &gt; Estudio, junto al resto de tus datos —
        no es una sección aparte.
      </p>
      <p>
        Se usan en tres sitios: tu portal de reservas, el widget incrustado en tu web, y el remitente de tus emails
        transaccionales — cambiarlos aquí los actualiza en los tres a la vez.
      </p>
      <AyudaResultado>
        Relacionado:{' '}
        <Link href="/ayuda/portal/personalizar-tu-portal" style={{ color: 'inherit', textDecoration: 'underline' }}>personalizar colores, tipografía y textos de tu portal</Link>, que va más allá del color de marca.
      </AyudaResultado>
    </>
  );
}
