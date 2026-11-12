import 'server-only';
import { logosClientesLanding } from '@/lib/landing/logos-clientes-servidor';
import type { LogoCliente } from '@/lib/landing/logos-clientes';

// Los logos REALES de estudios que ya trabajan con Tentare, para la maqueta. Misma fuente y mismas reglas que la franja de la home
// (`logosClientesLanding`): solo estudios con el consentimiento puesto por el equipo (`mostrar_logo_en_landing`), sin demos, con
// suscripción viva y con el logo en nuestro bucket. Ningún logo se escribe a mano en el repo. Sin ninguno, la franja no se pinta.
export async function logosParaLaMaqueta(): Promise<LogoCliente[]> {
  return logosClientesLanding();
}
