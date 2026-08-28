import Link from 'next/link';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado contra el modelo real: studios.* fija el default del estudio,
// tipos_clase.* lo sobrescribe por tipo de clase (NULL = hereda el default).
// Ver lib/booking-logic.ts (heredaOverride) y tentare-os.md, "Fase 1".
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Estas reglas se configuran por defecto para todo el estudio y cada tipo de clase puede tener las suyas
        propias — si no las tocas, un tipo de clase hereda siempre las de tu estudio.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Las cuatro reglas</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Exigir plan o bono activo</strong> — sin un plan que cubra ese tipo de clase, no se puede reservar.</li>
        <li><strong>Antelación mínima</strong> — cuánto tiempo antes del inicio deja de poder reservarse.</li>
        <li><strong>Antelación máxima</strong> — con cuánta anticipación se abre la reserva (para no llenar una clase con semanas de adelanto si no quieres).</li>
        <li><strong>Permitir lista de espera</strong> — si una clase llena admite lista de espera o simplemente deja de aceptar reservas.</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Aprobación manual</h2>
      <p>
        Además de esas cuatro, puedes exigir que una reserva de un tipo de clase concreto quede pendiente de tu
        aprobación en vez de confirmarse sola. Mientras está pendiente, no ocupa aforo ni consume bono — solo se
        descuenta cuando la apruebas, y ahí se vuelve a comprobar el aforo por si ya se ha llenado mientras
        esperaba.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Dónde se configuran</h2>
      <p>
        Los valores del estudio están en Configuración &gt; Reservas; los de un tipo de clase concreto, al editar ese
        tipo de clase. Un campo en blanco en el tipo de clase significa &ldquo;usa el del estudio&rdquo;, no &ldquo;sin límite&rdquo;.
      </p>

      <AyudaResultado>
        Cada reserva se comprueba contra las reglas vigentes en el momento de reservar — cambiar una regla no afecta
        a reservas que ya se hicieron con la anterior. Relacionado:{' '}
        <Link href="/ayuda/reservas/lista-de-espera" style={{ color: 'inherit', textDecoration: 'underline' }}>lista de espera</Link> y{' '}
        <Link href="/ayuda/reservas/no-shows" style={{ color: 'inherit', textDecoration: 'underline' }}>no-shows</Link>.
      </AyudaResultado>
    </>
  );
}
