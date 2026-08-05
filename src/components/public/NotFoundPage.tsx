import React from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import { PublicLayout } from './PublicLayout';
import type { PublicRoute } from '../../lib/router';

interface NotFoundPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function NotFoundPage({ currentRoute, onNavigate }: NotFoundPageProps) {
  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <section className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 py-20 bg-om-cream">
        <div className="text-center max-w-xl mx-auto">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Error
          </p>
          <h1 className="text-6xl md:text-8xl font-display font-semibold text-om-forest-deep mb-4">
            404
          </h1>
          <p className="text-xl md:text-2xl text-om-mahogany mb-3" style={{ fontFamily: "'EB Garamond', serif" }}>
            We couldn't find this page.
          </p>
          <p className="text-base text-om-brown mb-10" style={{ fontFamily: "'EB Garamond', serif" }}>
            The link may be broken or the page may have moved. Let's get you back on track.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onNavigate('home')}
              className="px-8 py-3.5 bg-om-forest text-om-cream hover:bg-om-forest-dark font-medium transition-colors rounded inline-flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Back to Home
            </button>
            <button
              onClick={() => window.history.back()}
              className="px-8 py-3.5 border border-om-tan text-om-mahogany hover:border-om-brown hover:text-om-forest-deep font-medium transition-colors rounded inline-flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
