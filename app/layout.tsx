import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Cormorant_Garamond } from 'next/font/google';
import { StudioProvider } from '@/lib/studio-context';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

// Elegant display serif for the Tentare boutique identity (titles, big numbers)
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Tentare · Gestión del estudio',
  description: 'Software de gestión para el estudio de pilates Tentare',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${jakarta.variable} ${cormorant.variable} antialiased`}>
      <body className="bg-[#FDFBFA]">
        <AuthProvider>
          <StudioProvider>{children}</StudioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
