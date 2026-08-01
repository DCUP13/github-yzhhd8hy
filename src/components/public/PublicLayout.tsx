import React, { useEffect } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import type { PublicRoute } from '../../lib/router';

interface PublicLayoutProps {
  children: React.ReactNode;
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function PublicLayout({ children, currentRoute, onNavigate }: PublicLayoutProps) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentRoute]);

  return (
    <div className="min-h-screen bg-om-cream font-body flex flex-col">
      <Navbar currentRoute={currentRoute} onNavigate={onNavigate} />
      <main className="flex-1 pt-20">{children}</main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
