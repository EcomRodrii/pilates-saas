import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado en vivo el 28-ago-2026 contra el portal real
// (tentare.app/portal/tentare/login) y contra lib/faqs.ts — ver
// e2e/ayuda-no-miente.spec.ts, que ata esta misma pregunta a la pantalla real
// para que la respuesta no vuelva a desincronizarse (ya pasó tres veces).
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        No tienes que dar de alta tú a una clienta para que pueda entrar: si ya te ha reservado una clase desde el
        portal público, ya existe como clienta tuya y puede crear su acceso ella misma.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Escribe su email">
        <p>Desde <code>tentare.app/portal/tu-estudio</code>, la primera pantalla solo pide el email. Tentare comprueba si ya es clienta tuya.</p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Pone su contraseña — o pide un enlace">
        <p style={{ margin: '0 0 12px' }}>
          En la misma pantalla escribe su contraseña. Si todavía no ha creado una, o no se acuerda, tiene el control
          <strong> «No tengo contraseña o la he olvidado — mándame un enlace»</strong>: se la manda por email y la
          elige ella en ese momento. También puede entrar directamente con su cuenta de Google.
        </p>
        <AyudaCaptura alt="Pantalla de acceso del portal, paso de contraseña" pendiente="paso 2 del acceso" />
      </AyudaPaso>

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
