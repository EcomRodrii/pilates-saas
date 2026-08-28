import Link from 'next/link';
import { AyudaPaso, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaPaso numero={1} titulo="Añade un bloque HTML personalizado">
        <p>En el editor de bloques de WordPress, añade un bloque &ldquo;HTML personalizado&rdquo; en la página donde quieras el calendario — no hace falta instalar ningún plugin nuevo.</p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Pega el código del widget">
        <p style={{ margin: 0 }}>
          El mismo fragmento de{' '}
          <Link href="/ayuda/widget/instalar-con-html" style={{ color: 'inherit', textDecoration: 'underline' }}>instalar con HTML</Link>, con el slug de tu estudio.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Publica y vacía la caché">
        <p style={{ margin: 0 }}>
          Si usas un plugin de caché (WP Rocket, W3 Total Cache…), vacíala después de publicar — si no, puede
          seguir sirviendo la versión antigua de la página sin el widget.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        No hace falta ningún plugin de terceros para reservas: el widget de Tentare funciona con el bloque de HTML
        que ya trae WordPress de serie.
      </AyudaResultado>
    </>
  );
}
