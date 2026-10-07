import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal-info';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// La URL de soporte que pide el App Store (y que cualquiera puede abrir sin cuenta).
// Dice la verdad sobre quién resuelve qué: las reservas, los bonos y los cobros
// los gestiona cada estudio; la app y la cuenta, Tentare.
const PATH = '/soporte';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

export default function Soporte() {
  return (
    <>
      <h1>Soporte</h1>
      <p className="lead">Cómo pedir ayuda con {LEGAL.marca} y con su app.</p>

      <h2>Si vas a clase en un estudio</h2>
      <p>
        Tus reservas, tus bonos, tu cuota y tus pagos los gestiona tu estudio. Para cambiar una reserva, una
        devolución o cualquier duda sobre una clase, escríbele: en la app tienes su teléfono, su correo y cómo
        llegar en <strong>Ayuda</strong>.
      </p>

      <h2>Problemas con la app o con tu cuenta</h2>
      <p>
        Si la app no funciona, no puedes entrar o algo no se ve bien, escríbenos a{' '}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Cuéntanos qué estabas haciendo, el modelo de tu
        teléfono y, si puedes, una captura de pantalla.
      </p>

      <h2>Borrar tu cuenta</h2>
      <p>
        Desde la app: <strong>Perfil → Privacidad y datos → Borrar mi cuenta de Tentare</strong>. Se borra al
        momento y ya no podrás entrar con ella en ningún estudio. Cada estudio conserva tu ficha y lo que la ley le
        obliga a guardar, como facturas y pagos. Si alguna vez entraste con Apple, quita también {LEGAL.marca} en
        los Ajustes del iPhone, en tu cuenta de Apple → Iniciar sesión con Apple.
      </p>

      <h2>Que un estudio borre tus datos</h2>
      <p>
        Si además quieres que tu estudio borre los datos que tiene de ti, pídeselo desde la app:{' '}
        <strong>Perfil → Privacidad y datos → Solicitar la eliminación de mis datos</strong>. La solicitud le llega a
        tu estudio, que es el responsable de tus datos y la gestiona en un plazo máximo de 30 días. También puedes
        escribir a <a href={`mailto:${LEGAL.emailPrivacidad}`}>{LEGAL.emailPrivacidad}</a>. Más detalle en la{' '}
        <a href="/privacidad">política de privacidad</a>.
      </p>

      <h2>Si tienes un estudio</h2>
      <p>
        La guía de cada pantalla está en el <Link href="/ayuda">Centro de Ayuda</Link>. Desde el panel también puedes
        escribirnos directamente.
      </p>
    </>
  );
}
