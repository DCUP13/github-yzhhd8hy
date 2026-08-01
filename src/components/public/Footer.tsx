import React from 'react';
import { Zap } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface FooterProps {
  onNavigate: (route: PublicRoute) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const footerSections: { heading: string; links: { label: string; route?: PublicRoute; href?: string }[] }[] = [
    {
      heading: 'Product',
      links: [
        { label: 'Features', route: 'features' },
        { label: 'Pricing', route: 'pricing' },
        { label: 'Security', route: 'security' },
        { label: 'Quiz', route: 'quiz' },
      ],
    },
    {
      heading: 'Company',
      links: [
        { label: 'About', route: 'about' },
        { label: 'Contact', route: 'contact' },
      ],
    },
    {
      heading: 'Legal',
      links: [
        { label: 'Privacy Policy', route: 'privacy' },
        { label: 'Terms of Service', route: 'terms' },
        { label: 'Cookie Policy', route: 'cookies' },
        { label: 'Accessibility (ADA)', route: 'ada' },
      ],
    },
  ];

  return (
    <footer className="bg-om-forest-deep text-om-tan pt-16 pb-8 border-t border-om-forest">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-7 h-7 text-om-gold" fill="currentColor" />
              <span className="text-base md:text-lg font-display font-semibold text-om-parchment tracking-wide">
                LoiBlast
              </span>
            </div>
            <p
              className="text-sm text-om-tan leading-relaxed max-w-xs"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              Transform your email management with AI-powered automation.
            </p>
          </div>

          {footerSections.map((section) => (
            <div key={section.heading}>
              <h4 className="font-display text-om-gold text-sm md:text-base tracking-widest uppercase mb-4">
                {section.heading}
              </h4>
              <ul className="space-y-2 text-base md:text-lg">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.route ? (
                      <button
                        onClick={() => onNavigate(link.route!)}
                        className="text-om-tan hover:text-om-parchment transition-colors"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <a
                        href={link.href}
                        onClick={(e) => e.preventDefault()}
                        className="text-om-tan hover:text-om-parchment transition-colors"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-om-forest">
          <p className="text-sm text-om-tan text-center" style={{ fontFamily: "'EB Garamond', serif" }}>
            &copy; {new Date().getFullYear()} LoiBlast. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
