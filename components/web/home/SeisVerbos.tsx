import Link from 'next/link';
import { SEIS_VERBOS } from '@/lib/landing/seis-verbos';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

// ─────────────────────────────────────────────────────────────────────────────
// Seis tarjetas «verbo + punto» justo bajo el héroe (fase 2.2): la forma de
// Momence, que pone el producto entero en un vistazo antes de contar nada más.
// Reúsa los datos de la ronda 3 (lib/landing/seis-verbos.ts), que ya llevan su
// fuente y su enlace verificados por lib/landing/ronda-3.test.ts; aquí cambia
// solo el estilo: icono de 32 px en el color de acento, el verbo como titular y
// una frase. Cada tarjeta entera lleva a SU página de función (Momence las
// mandaba todas a la demo).
//
// Los iconos salen del juego del repo (components/student/ui/Icono.tsx): nada de
// emojis ni de trazados a mano.
// ─────────────────────────────────────────────────────────────────────────────

const ICONOS: Record<string, NombreIcono> = {
  Reserva: 'calendario',
  Cobra: 'tarjeta',
  Avisa: 'campana',
  Cubre: 'instructoras',
  Factura: 'recibo',
  Mide: 'trofeo',
};

export function SeisVerbos() {
  return (
    <section id="verbos" className="wh-seccion wh-verbos" aria-labelledby="wh-verbos-h">
      <div className="wh-contenedor">
        <div className="wh-cabecera wh-cabecera-centro lp-rv">
          <h2 id="wh-verbos-h" className="wh-h2">Seis cosas que Tentare hace por ti.</h2>
        </div>
        <ul className="wh-verbos-rejilla">
          {SEIS_VERBOS.map((v) => (
            <li key={v.verbo} className="lp-rv">
              <Link href={v.href} className="wh-verbo">
                <span className="wh-verbo-icono"><Icono nombre={ICONOS[v.verbo] ?? 'mas'} tamano={32} grosor={1.4} /></span>
                <span className="wh-verbo-h">{v.verbo}.</span>
                <span className="wh-verbo-texto">{v.texto}</span>
                <span className="wh-verbo-ir">{v.funcion} <span aria-hidden="true">→</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
