import React, { useEffect } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

interface PublicLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function PublicLayout({ children, currentPage, onNavigate }: PublicLayoutProps) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <Navbar currentPage={currentPage} onNavigate={onNavigate} />
      <main className="flex-1 pt-16">{children}</main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
