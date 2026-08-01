import React from 'react';
import { PublicLayout } from './PublicLayout';
import type { PublicRoute } from '../../lib/router';

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
  sections: { heading: string; body: React.ReactNode }[];
}

export function LegalPage({ title, lastUpdated, currentRoute, onNavigate, sections }: LegalPageProps) {
  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <div className="bg-om-cream py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="mb-10">
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-om-forest-deep mb-3">{title}</h1>
            <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>Last updated: {lastUpdated}</p>
          </div>
          <div className="bg-om-parchment border border-om-tan rounded-xl p-8 sm:p-12 space-y-8">
            {sections.map((section, i) => (
              <section key={i}>
                <h2 className="text-xl font-display font-semibold text-om-forest-deep mb-3">{section.heading}</h2>
                <div
                  className="text-sm text-om-brown leading-relaxed space-y-3"
                  style={{ fontFamily: "'EB Garamond', serif" }}
                >
                  {section.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
