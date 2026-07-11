import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { StudioProvider } from '@/lib/studio-context';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://tentare.app'),
  title: 'Tentare — Software para estudios de Pilates | Reservas, cobros y app de marca',
  description:
    'Reservas, membresías, pagos y agenda en una sola plataforma. Tentare gestiona tu estudio de Pilates con un sistema autónomo que cobra, recuerda y llena tus clases — migración incluida y sin permanencia.',
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Tentare',
    title: 'Tentare — Software para estudios de Pilates',
    description:
      'Reservas, cobros y app de marca para tu estudio de Pilates. Migración incluida, sin permanencia.',
    url: 'https://tentare.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tentare — Software para estudios de Pilates',
    description:
      'Reservas, cobros y app de marca para tu estudio de Pilates. Migración incluida, sin permanencia.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${jakarta.variable} antialiased`}>
      <body className="bg-background">
        <AuthProvider>
          <StudioProvider>{children}</StudioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
