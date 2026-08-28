import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Secciones verificadas contra app/(dashboard)/informes/page.tsx — nombres
// reales de cada bloque, no una lista genérica de "lo que suele tener un
// SaaS".
export default function Contenido() {
  return (
    <>
      <p>Informes reúne en un solo sitio lo que antes tendrías que calcular a mano cruzando reservas, cobros y clases:</p>

      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Evolución de ingresos</strong> — cómo va facturando tu estudio mes a mes.</li>
        <li><strong>Ventas por tipo</strong> — qué se vende más: bonos, cuotas o clases sueltas.</li>
        <li><strong>Ocupación por tipo de clase</strong> — qué clases se llenan y cuáles no.</li>
        <li><strong>Retención</strong> — cuántas alumnas siguen viniendo, agrupadas por su mes de alta.</li>
        <li><strong>Top 5 clientas</strong> y <strong>clases más populares</strong>.</li>
        <li><strong>Margen por clase</strong> — con el punto de equilibrio: cuántas alumnas necesitas para que esa clase no dé pérdidas (si tienes configurado el coste de instructora).</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Exportar</h2>
      <p>Puedes exportar los datos a un archivo que se abre en Excel o Google Sheets, para cruzarlos con tu propia contabilidad si lo necesitas.</p>

      <AyudaResultado>
        El margen por clase solo se calcula si has puesto la tarifa por hora de cada instructora — sin ese dato,
        Tentare no inventa un coste, simplemente no muestra el margen para esa clase.
      </AyudaResultado>
    </>
  );
}
