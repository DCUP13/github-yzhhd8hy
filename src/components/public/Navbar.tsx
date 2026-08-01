import React, { useState, useEffect } from 'react';
import { Menu, X, Zap } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';
import { getRoutePath } from '../../lib/router';

interface NavbarProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function Navbar({ currentRoute, onNavigate }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [currentRoute]);

  const navLinks: { label: string; route: PublicRoute; gold?: boolean }[] = [
    { label: 'Features', route: 'features' },
    { label: 'Pricing', route: 'pricing' },
    { label: 'Quiz', route: 'quiz', gold: true },
    { label: 'About', route: 'about' },
    { label: 'Security', route: 'security' },
  ];

  const handleNav = (route: PublicRoute) => {
    onNavigate(route);
    setMobileOpen(false);
  };

  const isActive = (route: PublicRoute) => currentRoute === route;

  return (
    <header className="fixed top-0 left-0 right-0 bg-om-forest-deep/95 backdrop-blur-md border-b border-om-forest z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => handleNav('home')}
          className="flex items-center gap-2"
        >
          <Zap className="w-7 h-7 text-om-gold" fill="currentColor" />
          <span className="text-base md:text-lg font-display font-semibold text-om-parchment tracking-wide">
            LoiBlast
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-8 text-base md:text-lg text-om-tan">
          {navLinks.map((link) => (
            <button
              key={link.route}
              onClick={() => handleNav(link.route)}
              className={`hover:text-om-parchment transition-colors ${link.gold ? 'text-om-gold' : ''} ${
                isActive(link.route) ? 'text-om-parchment' : ''
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => handleNav('login')}
            className="px-6 py-2.5 text-om-tan hover:text-om-parchment text-base md:text-lg font-medium transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => handleNav('register')}
            className="px-6 py-2.5 border border-om-gold text-om-gold hover:bg-om-gold hover:text-om-forest-deep text-base md:text-lg font-medium transition-colors rounded"
          >
            Get Started
          </button>
        </div>

        <button
          className="md:hidden p-2 text-om-tan hover:text-om-parchment transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-om-forest-deep border-t border-om-forest px-6 py-4 flex flex-col gap-4">
          {navLinks.map((link) => (
            <button
              key={link.route}
              onClick={() => handleNav(link.route)}
              className={`text-left text-base ${link.gold ? 'text-om-gold' : 'text-om-tan'} hover:text-om-parchment transition-colors py-1`}
            >
              {link.label}
            </button>
          ))}
          <div className="border-t border-om-forest pt-4 flex flex-col gap-3">
            <button
              onClick={() => handleNav('login')}
              className="text-left text-base text-om-tan hover:text-om-parchment font-medium transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => handleNav('register')}
              className="text-left text-base text-om-gold border border-om-gold px-6 py-2.5 rounded transition-colors hover:bg-om-gold hover:text-om-forest-deep"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
