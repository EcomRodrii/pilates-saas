import { loginNuevoVisible } from '@/lib/auth/login-nuevo';
import { LoginCliente } from './login-cliente';

// La pantalla es de cliente. Esta página solo decide en el SERVIDOR qué piel ve esta visita
// (`LOGIN_NUEVO`, lib/auth/login-nuevo.ts): las variables no le llegan al navegador.
// `searchParams` es una promesa (Next 16) y hace la página dinámica: se lee en cada petición.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { login } = await searchParams;
  return <LoginCliente nuevo={loginNuevoVisible(process.env.LOGIN_NUEVO, login)} />;
}
