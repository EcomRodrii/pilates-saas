import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 14-sep-2026: el editor de tema (/configuracion/apariencia/editor)
// está cerrado por mantenimiento desde el 7-sep —su ruta redirige y Apariencia
// lo dice—, así que el artículo contaba un editor que nadie puede abrir. Se
// quitó la captura por la misma razón: enseñaba esa pantalla cerrada.
export default function Contenido() {
  return (
    <>
      <p>
        El editor de la portada, la tipografía y las secciones del portal de tus alumnas está{' '}
        <strong>en mantenimiento</strong>: lo estamos rehaciendo y, mientras tanto, esa parte no se puede editar.
      </p>
      <p>
        Lo que ya tenías publicado sigue funcionando igual — tus clientas ven tu marca como siempre.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Lo que sí puedes cambiar hoy</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Tu logo</strong>, en Configuración &gt; Mi app y mi web, en «Marca».</li>
        <li><strong>Tu color</strong>, desde «El color de tu marca», en esa misma tarjeta.</li>
        <li><strong>Los textos con los que te presentas</strong> en tu página de reservas, en «Textos de tu app», en esa misma pantalla.</li>
      </ul>

      <AyudaResultado>
        En cuanto el editor vuelva, lo contaremos en Actualizaciones. Mientras, ver{' '}
        <Link href="/ayuda/configuracion/marca" style={{ color: 'inherit', textDecoration: 'underline' }}>tu marca: logo y color</Link>.
      </AyudaResultado>
    </>
  );
}
