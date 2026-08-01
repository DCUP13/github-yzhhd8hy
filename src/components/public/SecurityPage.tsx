import React from 'react';
import { PublicLayout } from './PublicLayout';
import { Shield, Lock, Eye, Server, Key, FileCheck, ArrowRight } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface SecurityPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function SecurityPage({ currentRoute, onNavigate }: SecurityPageProps) {
  const measures = [
    { icon: Lock, title: 'Encryption', body: 'All data transmission uses TLS/SSL encryption. Passwords are hashed using bcrypt before storage. Database connections are encrypted. OAuth tokens are stored encrypted and refreshed automatically.' },
    { icon: Server, title: 'Row-Level Security', body: 'Every database table has row-level security enabled. Users can only access their own data — never another user\'s emails, contacts, or settings.' },
    { icon: Key, title: 'Authentication', body: 'Secure session management with JWT tokens. Optional two-factor authentication for sensitive operations. Automatic session expiry and secure token refresh.' },
    { icon: Eye, title: 'Data Isolation', body: 'Complete data isolation between accounts. Your emails, contacts, and business data are never shared with or accessible by other users.' },
    { icon: FileCheck, title: 'Compliance', body: 'GDPR and CCPA compliant data handling. Clear data retention policies. Full data export and deletion capabilities on request.' },
    { icon: Shield, title: 'Monitoring', body: 'Continuous security monitoring and audit logging. Regular security reviews and penetration testing. Automated threat detection and response.' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Security
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            Your Data, Protected
          </h1>
          <p
            className="text-xl md:text-2xl text-om-mahogany max-w-3xl mx-auto"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            Enterprise-grade security to protect your communications.
          </p>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {measures.map((measure) => {
            const Icon = measure.icon;
            return (
              <div key={measure.title} className="bg-om-cream border border-om-tan rounded-xl p-8">
                <div className="w-12 h-12 rounded-lg bg-om-parchment border border-om-tan/30 flex items-center justify-center mb-5">
                  <Icon className="w-6 h-6 text-om-forest" />
                </div>
                <h3 className="text-xl font-display font-semibold text-om-forest-deep mb-3">{measure.title}</h3>
                <p
                  className="text-sm md:text-base text-om-brown leading-relaxed"
                  style={{ fontFamily: "'EB Garamond', serif" }}
                >
                  {measure.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto">
          <div className="bg-om-forest-deep border border-om-forest rounded-xl p-10 text-center">
            <Shield className="w-12 h-12 text-om-gold mx-auto mb-6" />
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-4">
              Security You Can Trust
            </h2>
            <p
              className="text-lg text-om-tan mb-8 max-w-2xl mx-auto"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              We take security seriously so you can focus on your business, not your infrastructure. Every layer of our platform is designed with protection in mind.
            </p>
            <button
              onClick={() => onNavigate('register')}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
