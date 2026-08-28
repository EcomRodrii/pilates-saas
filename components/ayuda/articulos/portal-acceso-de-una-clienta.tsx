import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado en vivo el 28-ago-2026 contra el portal real
// (tentare.app/portal/estudio-aurora/login) y contra lib/faqs.ts — ver
// e2e/ayuda-no-miente.spec.ts, que ata esta misma pregunta a la pantalla real
// para que la respuesta no vuelva a desincronizarse (ya pasó tres veces).
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        No tienes que dar de alta tú a una clienta para que pueda entrar: si ya te ha reservado una clase desde el
        portal público, ya existe como clienta tuya y puede crear su acceso ella misma.
      </AyudaAntesDeEmpezar>

      <p>
        Es una única pantalla, no un asistente en pasos: email, contraseña, entrar con Google y el enlace de
        recuperación conviven ahí a la vez — para no obligar a nadie a adivinar por dónde va antes de escribir nada.
      </p>

      <AyudaCaptura
        src="/help/portal/portal-pantalla-de-acceso.png"
        alt="Pantalla única de acceso al portal: email, contraseña, Google y enlace de recuperación"
        caption="La pantalla de acceso real de un estudio — email y contraseña primero."
      />

      <p>
        Escribe su email y su contraseña. Si todavía no ha creado una, o no se acuerda, tiene el control{' '}
        <strong>&ldquo;No tengo contraseña o la he olvidado — mándame un enlace&rdquo;</strong>: se la manda por
        email y la elige ella en ese momento. También puede entrar directamente con su cuenta de Google.
      </p>

      <AyudaResultado>
        La clienta entra a su portal sin que tú tengas que enviarle nada a mano ni crearle un usuario. Lo único que
        puede fallar es que el enlace de recuperación no le llegue — mira{' '}
        <Link href="/ayuda/problemas/una-clienta-no-puede-entrar" style={{ color: 'inherit', textDecoration: 'underline' }}>
          una clienta no puede entrar al portal
        </Link>.
      </AyudaResultado>
    </>
  );
}
