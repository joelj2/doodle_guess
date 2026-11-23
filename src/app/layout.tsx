import type { Metadata, Viewport } from 'next';
import React from 'react';
import '../index.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: 'DoodleGuess — Real-Time Drawing & Guessing Arena',
  description:
    'Real-time multiplayer drawing and guessing arena with progressive timed letter hints and smart answer matching.',
  openGraph: {
    title: 'DoodleGuess — Real-Time Drawing & Guessing Arena',
    description:
      'Real-time multiplayer drawing and guessing arena with progressive timed letter hints and smart answer matching.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DoodleGuess — Real-Time Drawing & Guessing Arena',
    description:
      'Real-time multiplayer drawing and guessing arena with progressive timed letter hints and smart answer matching.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
