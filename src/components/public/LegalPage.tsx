import React from 'react';
import { PublicLayout } from './PublicLayout';

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  currentPage: string;
  onNavigate: (page: string) => void;
  sections: { heading: string; body: React.ReactNode }[];
}

export function LegalPage({ title, lastUpdated, currentPage, onNavigate, sections }: LegalPageProps) {
  return (
    <PublicLayout currentPage={currentPage} onNavigate={onNavigate}>
      <div className="bg-gray-50 dark:bg-gray-950 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">{title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last updated: {lastUpdated}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-8 sm:p-12 space-y-8">
            {sections.map((section, i) => (
              <section key={i}>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{section.heading}</h2>
                <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-3">
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
