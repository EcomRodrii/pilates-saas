import Link from 'next/link';

// Sin esto, Next.js sirve su 404 por defecto EN INGLÉS — en un sitio 100% en
// español ("Hecho en España" incluido en la propia landing). Detectado
// probando el flujo de alta como una propietaria real.
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="max-w-sm text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Esta página no existe.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Puede que el enlace esté mal escrito o que la página se haya movido.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:brightness-95"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
