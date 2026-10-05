import Link from 'next/link';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 5-oct-2026 con la entrada por código (P08). Antes: verificado en vivo el 28-ago-2026 contra el portal real
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
        Es una sola puerta para entrar y para darse de alta: no tiene que saber si ya tiene cuenta. Escribe su email,
        pulsa <strong>&ldquo;Seguir&rdquo;</strong> y le llega un código de 6 cifras al correo, que caduca a los 10
        minutos (en el iPhone, el teclado lo rellena solo desde el correo).
      </p>

      {/* La captura que había aquí enseñaba una pantalla de dos versiones atrás
          («¿Entramos?», email y contraseña): una imagen que contradice el texto
          es peor que ninguna. Falta hacer la nueva con un estudio de muestra. */}

      <p>
        Si ya es clienta tuya, con el código entra directamente. Si es su primera vez, después le pedimos su nombre,
        su teléfono si quiere darlo y que acepte tus condiciones y tu política de privacidad (las tuyas, no las de
        Tentare). Quien tiene contraseña puede usarla con <strong>&ldquo;Usar mi contraseña&rdquo;</strong>, y si no se
        acuerda, <strong>&ldquo;¿Has olvidado la contraseña?&rdquo;</strong> le manda un enlace para crear una nueva.
        También puede entrar con su cuenta de Google, o con Apple desde la app de iPhone.
      </p>

      <AyudaResultado>
        La clienta entra a su portal sin que tú tengas que enviarle nada a mano ni crearle un usuario. Lo único que
        puede fallar es que el código no le llegue — mira{' '}
        <Link href="/ayuda/problemas/una-clienta-no-puede-entrar" style={{ color: 'inherit', textDecoration: 'underline' }}>
          una clienta no puede entrar al portal
        </Link>.
      </AyudaResultado>
    </>
  );
}
