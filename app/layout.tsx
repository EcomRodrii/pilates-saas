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
  title: 'Tentare — Software para estudios de Pilates | Reservas, cobros y sustituciones',
  description:
    'El software completo para tu estudio de Pilates en España: reservas, cobros, calendario, alumnas e instructoras — y el que cubre las bajas de instructoras solo. Sin permanencia, desde 29€/mes.',
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Tentare',
    title: 'Tentare — Software para estudios de Pilates',
    description:
      'Todo tu estudio de Pilates en un solo software — y el que cubre las bajas de instructoras solo. Sin permanencia, desde 29€/mes.',
    url: 'https://tentare.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tentare — Software para estudios de Pilates',
    description:
      'Todo tu estudio de Pilates en un solo software — y el que cubre las bajas de instructoras solo.',
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
