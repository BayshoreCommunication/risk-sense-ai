import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthBridge } from '@/components/auth/AuthBridge';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'RiskSense AI',
  description: 'AI-powered conversational risk assessment',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthBridge />
        {children}
      </body>
    </html>
  );
}
