import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GymOS — پذیرش',
  description: 'مدیریت باشگاه',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // dir and lang on <html>: every logical property in Tailwind v4 keys off this.
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
