import type { ReactNode } from 'react';
import { BellRing, Check, Hourglass, ShieldCheck } from 'lucide-react';
import { AppAlumna } from '@/components/web/home/piezas';

// ─────────────────────────────────────────────────────────────────────────────
// Los fragmentos de producto de los índices (/funcionalidades y /soluciones): como en la home, no se enseña el panel entero sino el
// MOMENTO que demuestra la promesa del área (3 a 5 elementos, legibles al tamaño de una tarjeta). Cada uno copia la estructura y los
// textos de la pantalla real de la que sale (lista de espera con plaza ofrecida, cobros con «Se reintenta solo», sustitución «Esperando
// tu visto bueno», informes de ocupación), con la paleta de la home nueva.
//
// Los nombres, las horas y las cifras son de MUESTRA (los del sembrado de los e2e). Todo va `aria-hidden` dentro de un <figure> con su
// descripción: un lector de pantalla no debe leer cifras de ejemplo como si fueran de su estudio. Server Components: nada de esto entra
// en el JavaScript de la página.
// ─────────────────────────────────────────────────────────────────────────────

function Escena({ descripcion, children }: { descripcion: string; children: ReactNode }) {
  return (
    <figure className="hx-fig">
      <div className="hx-fig-piezas" aria-hidden="true">{children}</div>
      <figcaption className="hx-oculto">{descripcion}</figcaption>
    </figure>
  );
}

type Tono = 'ok' | 'aviso' | 'error' | 'neutro';
const Pastilla = ({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) => <span className={`hx-pastilla hx-pastilla--${tono}`}>{children}</span>;
const Iniciales = ({ t }: { t: string }) => <span className="hx-ini">{t}</span>;

/** Reservas y horario: una clase llena y la plaza que se libera, ofrecida a la primera de la lista. */
export function EscenaReservas() {
  return (
    <Escena descripcion="Ejemplo en Tentare: una clase de Reformer a las 19:00 a la que se le libera una plaza, ofrecida a la primera alumna de la lista de espera, y una reserva confirmada.">
      <div className="hx-c hx-c--a">
        <div className="hx-c-cab"><b>Reformer Avanzado · 19:00</b><Pastilla tono="aviso">Se liberó 1 plaza</Pastilla></div>
        <p className="hx-c-sub">Sala Norte · Con Ana</p>
        <div className="hx-plazas">
          {Array.from({ length: 8 }, (_, i) => <span key={i} className={i === 7 ? 'hx-plaza hx-plaza--libre' : 'hx-plaza'} />)}
          <span className="hx-plazas-n">7 de 8 ocupadas</span>
        </div>
      </div>
      <div className="hx-c hx-c--b">
        <div className="hx-c-cab"><b className="hx-c-icono"><Hourglass size={16} strokeWidth={1.7} /> Lista de espera</b><Pastilla tono="ok">Plaza liberada</Pastilla></div>
        <div className="hx-fi"><Iniciales t="CD" /><span className="hx-fi-cuerpo"><b>Carmen</b><span>Le toca: tiene plazo para aceptarla</span></span></div>
        <div className="hx-fi"><Iniciales t="BO" /><span className="hx-fi-cuerpo"><b>Bea</b><span>Siguiente en la lista</span></span></div>
      </div>
      <span className="hx-flota hx-flota--a"><Check size={16} strokeWidth={2} /> Reserva confirmada · Lucía</span>
    </Escena>
  );
}

/** Dinero: cuotas cobradas, una que se reintenta sola y la factura que sale sin emitirla. */
export function EscenaCobros() {
  return (
    <Escena descripcion="Ejemplo de la pantalla de cobros de Tentare: dos cuotas cobradas, una que se reintenta sola y la factura que se genera sin emitirla a mano.">
      <div className="hx-c hx-c--ancha">
        <div className="hx-c-cab"><b>Cobros</b><span className="hx-c-sub hx-c-sub--r">Próximas cuotas · 30 días</span></div>
        {[
          ['AM', 'Ana Martín', 'Mensual ilimitado', '75 €', 'Cobrada', 'ok'],
          ['LR', 'Laura Ramos', 'Mensual 2 días', '59 €', 'Se reintenta solo', 'aviso'],
          ['CD', 'Carmen Del Río', 'Bono 10 clases', '120 €', 'Cobrada', 'ok'],
        ].map(([ini, n, c, imp, est, tono]) => (
          <div className="hx-fi" key={n}>
            <Iniciales t={ini} />
            <span className="hx-fi-cuerpo"><b>{n}</b><span>{c}</span></span>
            <span className="hx-fi-dcha"><b>{imp}</b><Pastilla tono={tono as Tono}>{est}</Pastilla></span>
          </div>
        ))}
      </div>
      <span className="hx-flota hx-flota--b"><Check size={16} strokeWidth={2} /> Factura generada</span>
    </Escena>
  );
}

/** Alumnas y app: la app real de la alumna, un aviso y su ficha con la salud solo para quien debe verla. */
export function EscenaAlumnas() {
  return (
    <Escena descripcion="La app de la alumna con la marca del estudio (captura real, estudio de muestra), un aviso de bono por caducar y una ficha de alumna con su adaptación de salud, visible solo para quien debe verla.">
      <div className="hx-movil"><AppAlumna captura="miPlan" escala={0.5} /></div>
      <div className="hx-c hx-c--aviso">
        <span className="hx-c-icono hx-c-icono--caja"><BellRing size={16} strokeWidth={1.7} /></span>
        <span className="hx-fi-cuerpo"><b>Tu bono está por caducar</b><span>Te quedan 2 sesiones</span></span>
      </div>
      <div className="hx-c hx-c--ficha">
        <div className="hx-c-cab"><b>Marta · ficha</b></div>
        <p className="hx-c-sub">Adaptación: hombro derecho</p>
        <span className="hx-c-icono hx-c-icono--linea"><ShieldCheck size={15} strokeWidth={1.7} /> Solo la ve quien debe</span>
      </div>
    </Escena>
  );
}

/** Equipo: una baja con las candidatas ordenadas por encaje, esperando el visto bueno (el modo de serie). */
export function EscenaEquipo() {
  return (
    <Escena descripcion="Ejemplo de una sustitución en Tentare: una instructora no puede dar su clase de las 19:00 y se proponen candidatas ordenadas por encaje, a la espera de tu visto bueno.">
      <div className="hx-c hx-c--ancha">
        <div className="hx-c-cab"><span className="hx-fi-cuerpo"><b>Reformer Avanzado · 19:00</b><span>Marta no puede darla</span></span><Pastilla tono="aviso">Esperando tu visto bueno</Pastilla></div>
        <p className="hx-c-etiqueta">Encaje con esta clase</p>
        {[['AF', 'Ana Ferrer', 'Da esta clase los martes', 92], ['LR', 'Lucía Ramos', 'Libre a esa hora', 74], ['SM', 'Sara Molina', 'Ha dado Reformer Avanzado', 58]].map(([ini, n, nota, v]) => (
          <div className="hx-fi" key={n as string}>
            <Iniciales t={ini as string} />
            <span className="hx-fi-cuerpo"><b>{n}</b><span>{nota}</span></span>
            <span className="hx-barra"><span style={{ width: `${v}%` }} /></span>
          </div>
        ))}
        <div className="hx-botones-ui"><span className="hx-boton-ui">Avisar por email</span><span className="hx-boton-ui hx-boton-ui--claro">Lo resuelvo por mi cuenta</span></div>
      </div>
    </Escena>
  );
}

/** Decisiones: ingresos de los últimos meses y la ocupación por tipo de clase. */
export function EscenaInformes() {
  const meses = [['may', 52], ['jun', 58], ['jul', 49], ['ago', 44], ['sep', 71], ['oct', 80]] as const;
  const tipos = [['Reformer Avanzado', 94], ['Reformer Fundamental', 81], ['Yoga Flow', 68]] as const;
  return (
    <Escena descripcion="Ejemplo de los informes de Tentare: evolución de ingresos de los últimos seis meses y ocupación por tipo de clase.">
      <div className="hx-c hx-c--a">
        <div className="hx-c-cab"><b>Evolución de ingresos</b><span className="hx-c-sub hx-c-sub--r">Últimos 6 meses</span></div>
        <div className="hx-barras">
          {meses.map(([m, v], i) => (
            <span key={m} className={i === meses.length - 1 ? 'hx-col hx-col--ultima' : 'hx-col'}><span style={{ height: `${v}%` }} /><small>{m}</small></span>
          ))}
        </div>
      </div>
      <div className="hx-c hx-c--b">
        <div className="hx-c-cab"><b>Ocupación por tipo de clase</b></div>
        {tipos.map(([t, v]) => (
          <div className="hx-ocu" key={t}><span>{t}</span><span className="hx-barra hx-barra--larga"><span style={{ width: `${v}%` }} /></span><b>{v} %</b></div>
        ))}
      </div>
    </Escena>
  );
}

/** Cambiarse de programa: lo que se revisa antes de tocar nada (para la tarjeta de /soluciones que no tiene foto). */
export function EscenaCambio() {
  return (
    <Escena descripcion="Ejemplo de la importación al cambiarte a Tentare: clientas, bonos, clases y reservas y pagos históricos, revisados antes de aplicar nada.">
      <div className="hx-c hx-c--ancha">
        <div className="hx-c-cab"><b>Tu importación</b><Pastilla tono="ok">Revisada</Pastilla></div>
        {['Clientas y fichas', 'Bonos con sus sesiones', 'Clases y reservas', 'Pagos históricos'].map(t => (
          <div className="hx-fi hx-fi--check" key={t}><span className="hx-check"><Check size={14} strokeWidth={2.2} /></span><span className="hx-fi-cuerpo"><b>{t}</b></span></div>
        ))}
        <p className="hx-c-sub hx-c-sub--pie">Se revisa antes de tocar nada</p>
      </div>
    </Escena>
  );
}

/** La clase llena + lista de espera, para la tarjeta destacada de /soluciones. */
export { EscenaReservas as EscenaPilates };
