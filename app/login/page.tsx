import { loginNuevoVisible } from '@/lib/auth/login-nuevo';
import { LoginCliente } from './login-cliente';

// La pantalla es de cliente. Esta página solo decide en el SERVIDOR qué piel ve esta visita
// (`LOGIN_NUEVO`, lib/auth/login-nuevo.ts): las variables no le llegan al navegador.
// `searchParams` es una promesa (Next 16) y hace la página dinámica: se lee en cada petición.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { login } = await searchParams;
  // «Continuar con Apple» solo se pinta con `LOGIN_APPLE=on`: hasta que el proveedor esté configurado en Supabase (Service ID y clave),
  // pulsarlo daba «Unsupported provider: missing OAuth secret».
  const apple = (process.env.LOGIN_APPLE ?? '').trim().toLowerCase() === 'on';
  return <LoginCliente nuevo={loginNuevoVisible(process.env.LOGIN_NUEVO, login)} apple={apple} />;
}
