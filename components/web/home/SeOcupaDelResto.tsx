import { BotonBloque } from '@/components/landing/BotonBloque';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

// ─────────────────────────────────────────────────────────────────────────────
// «Tú das la clase. Tentare se ocupa del resto.» (fase 2.2). Sustituye a «¿Te
// suena?», que contaba cuatro penas con su hora y acababa en un suspiro: el
// fundador la leyó y no enganchaba. Ahora la PROMESA va primero y cada tarjeta
// es un resultado para la dueña (titular corto) + cómo lo hace Tentare (una
// frase). La forma es la rejilla de la página de Pilates de bsport (título y
// una línea, separados por filetes finos) con el icono como lo usan las cinco
// referencias: sin baldosa, en el color de la marca, a 28 px. Sin fragmentos de UI aquí a propósito: los del héroe y el bento
// cuentan lo mismo y repetir viñetas es justo el fallo de Momence.
//
// Conserva el id `te-suena`: es la `ubicacion` de PostHog de esta franja de la
// página y el ancla que miden los e2e de la isla.
//
// Cada frase, contra el código (lista completa en el PR):
//   · cancelar y volver a reservar desde la app; lista de espera que ofrece la
//     plaza sola (`promocionar_siguiente_espera`, con plazo opcional);
//   · avisos de bono: «Tu bono está por caducar» (cron notif-bonos, bonos con
//     sesiones que caducan en 7 días) y «Se te ha agotado el bono», los dos con
//     el enlace a comprar en la app (lib/notifications/catalog.ts);
//   · sustituciones en modo asistido, el de serie: Tentare propone y escribe
//     tras el visto bueno (app/funcionalidades/sustituciones);
//   · cuotas con tarjeta guardada o adeudo SEPA y reintento (lib/billing/dunning.ts).
// Nada de efectivo ni transferencias: eso no se cobra solo.
// ─────────────────────────────────────────────────────────────────────────────

const TARJETAS = [
  {
    titulo: 'Cambios de clase sin un solo mensaje.',
    texto: 'La alumna cancela y reserva otra hora desde su app. Si la clase está llena, entra en la lista de espera y la plaza se le ofrece sola cuando se libera.',
    icono: 'plaza',
  },
  {
    titulo: 'Ningún bono caduca por sorpresa.',
    texto: 'Tentare avisa a la alumna en el móvil cuando su bono está por caducar con sesiones sin usar, y cuando se le agota. Lo renueva desde su app.',
    icono: 'bono',
  },
  {
    titulo: 'Una baja, cubierta sin escribir a nadie.',
    texto: 'Tentare propone quién puede dar la clase y, en cuanto das el visto bueno, le escribe por orden. Tú no persigues a nadie.',
    icono: 'instructoras',
  },
  {
    titulo: 'A fin de mes, las cuotas cobradas.',
    texto: 'Se cobran solas con la tarjeta guardada o por adeudo SEPA. Si una falla, se reintenta y a la alumna le llega el aviso.',
    icono: 'tarjeta',
  },
] as const satisfies readonly { titulo: string; texto: string; icono: NombreIcono }[];

export function SeOcupaDelResto() {
  return (
    <section id="te-suena" className="wh-seccion wh-resto" aria-labelledby="wh-resto-h">
      <div className="wh-contenedor wh-resto-rejilla">
        <div className="wh-resto-intro">
          {/* Home v2 (20-oct-2026): la frase que lo resume pasa a ser el titular; el
              «Tú das la clase» se lo queda el héroe («…aunque sueltes el móvil»). */}
          <h2 id="wh-resto-h" className="wh-h2">Lo que antes te llevaba la tarde, ahora pasa solo.</h2>
          <p className="wh-lead">Cambios de hora, bonos que caducan, bajas del equipo y cobros: Tentare los lleva mientras tú estás en la sala.</p>
          <div className="wh-cierre-linea">
            <BotonBloque />
          </div>
        </div>
        <ul className="wh-resto-lista">
          {TARJETAS.map((t) => (
            <li key={t.titulo} className="wh-resto-item lp-rv">
              <span className="wh-baldosa"><Icono nombre={t.icono} tamano={28} grosor={1.4} /></span>
              <div>
                <h3 className="wh-h3">{t.titulo}</h3>
                <p className="wh-texto">{t.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
