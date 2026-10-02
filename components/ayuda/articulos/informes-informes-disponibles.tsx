import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Secciones verificadas contra app/(dashboard)/informes/page.tsx y
// components/informes/* (rediseño del 2-oct-2026) — nombres reales de cada
// bloque, no una lista genérica de "lo que suele tener un SaaS".
export default function Contenido() {
  return (
    <>
      <p>
        Informes responde a tres preguntas —cuánto has cobrado, cómo se llenan las clases y quién viene— por semana, mes,
        trimestre o año. Abre en el mes en curso, y con las flechas puedes ver un periodo ya cerrado. Cada cifra se compara
        con el mismo tramo del periodo anterior: a día 2, octubre se compara con el 1 y el 2 de septiembre, no con
        septiembre entero.
      </p>

      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Dinero</strong> — lo cobrado, ya restado lo devuelto: la misma cifra que «Lo que he cobrado» en Cobros. Por qué entró (cuotas, bonos, clases sueltas, sesiones privadas, caja y otros) y el ingreso medio por clienta que pagó.</li>
        <li><strong>Clases</strong> — la ocupación de cada tipo de clase. Se despliega por franja (día y hora) y, dentro, cada clase con su margen y su punto de equilibrio: cuántas alumnas necesitas para que esa clase no dé pérdidas.</li>
        <li><strong>Clientas</strong> — las que más vienen, las nuevas del periodo, las activas hoy y cuántas siguen viniendo según el mes en que empezaron.</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Descargar</h2>
      <p>
        En «Descargar» tienes lo cobrado del periodo que estás viendo, en un archivo que se abre en Excel o Google Sheets
        (el mismo que en Cobros), y «Imprimir / guardar PDF». Para el cierre del trimestre o del año está «Cierre para la
        gestoría».
      </p>

      <AyudaResultado>
        El margen por clase solo se calcula si has puesto la tarifa por hora de cada instructora — sin ese dato,
        Tentare no inventa un coste, simplemente no muestra el margen para esa clase. Informes es de la
        propietaria: recepción y responsable de sede no lo ven.
      </AyudaResultado>
    </>
  );
}
