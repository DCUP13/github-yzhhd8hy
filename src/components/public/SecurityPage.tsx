import React from 'react';
import { PublicLayout } from './PublicLayout';
import {
  Shield, Lock, Eye, Server, Key, FileCheck,
  ArrowRight, Database, Cloud
} from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface SecurityPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function SecurityPage({ currentRoute, onNavigate }: SecurityPageProps) {
  const measures = [
    {
      icon: Lock,
      title: 'Encryption Everywhere',
      body: 'Every piece of data moving between you and our servers is encrypted in transit, and sensitive data is encrypted at rest. Passwords are never stored in readable form — they are hashed before they ever touch our database. Email credentials, connection keys, and access tokens are kept in encrypted server-side vaults that your browser can never see.',
    },
    {
      icon: Server,
      title: 'Per-User Data Isolation',
      body: 'Your data is fenced off from every other user at the database level — not just in the app. The database itself enforces that each account can only read and modify its own contacts, campaigns, templates, sent emails, and settings. No user can ever query, view, or edit another user\'s data, period.',
    },
    {
      icon: Key,
      title: 'Secure Authentication',
      body: 'Sessions are managed with cryptographically signed tokens that expire automatically and refresh securely. Your account credentials are never stored in plain text. Optional two-factor authentication is available from your account settings for an added layer of protection.',
    },
    {
      icon: Eye,
      title: 'Private By Design',
      body: 'Your contacts, campaign templates, email history, AI prompts, and analytics are never shared with or accessible by other users. Each account lives in its own secured partition, and we never sell, rent, or share your data with third parties for marketing purposes.',
    },
    {
      icon: FileCheck,
      title: 'Compliance & Control',
      body: 'GDPR and CCPA compliant data handling with clear retention policies. You can export or permanently delete your data at any time from your account settings. When AI features are used, content is processed only for the purpose of fulfilling your request and never used to train external models.',
    },
    {
      icon: Database,
      title: 'Quality Safeguards',
      body: 'Built-in data quality scoring prevents campaigns from running when contact data is incomplete or below your configured threshold. This protects your sender reputation by ensuring you never send emails to contacts with missing names, broken addresses, or insufficient personalization data.',
    },
  ];

  const thirdParty = [
    {
      label: 'Outbound Email Delivery',
      what: 'Sends your campaign and one-to-one emails',
      security: 'Connected through industry-standard encrypted transport. Sending credentials are stored in encrypted server-side secrets and never exposed to your browser. All message delivery happens on our secured servers, not your device.',
    },
    {
      label: 'Connected Email Accounts',
      what: 'Lets you send through your own email address',
      security: 'Account-specific passwords with strong authentication. Credentials are stored encrypted on the server, never logged, and never cached in your browser.',
    },
    {
      label: 'AI Content Generation',
      what: 'Powers smart template writing and auto-replies',
      security: 'Your AI access key is stored as an encrypted server secret. Email content is sent for processing only when you use AI features, solely to complete your request, and is never used to train external models.',
    },
    {
      label: 'Lead & Listing Data Sources',
      what: 'Provides public agent and listing information for lead building',
      security: 'Access keys are stored as encrypted server secrets and used only server-side to fetch publicly available data. Keys are never sent to your browser or logged.',
    },
    {
      label: 'File & Attachment Storage',
      what: 'Stores email attachments securely',
      security: 'Files are served through short-lived, expiring download links generated only after verifying you own the message. Storage credentials are never exposed to your browser.',
    },
    {
      label: 'Social Engagement Capture',
      what: 'Captures engagement events from connected social accounts',
      security: 'Long-lived access tokens are stored encrypted and protected by per-user policies. Incoming events are verified and de-duplicated to prevent tampering or replay.',
    },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      {/* Hero */}
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
            Enterprise-grade security built into every layer — from the database to the email queue to the AI pipeline.
          </p>
        </div>
      </section>

      {/* Security Measures */}
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

      {/* Third-Party Security */}
      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Cloud className="w-10 h-10 text-om-forest mx-auto mb-4" />
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              Integrations You Can Trust
            </h2>
            <p className="text-lg text-om-mahogany max-w-2xl mx-auto" style={{ fontFamily: "'EB Garamond', serif" }}>
              Every connected service is held to the same security standard as our own platform.
            </p>
          </div>
          <div className="space-y-4">
            {thirdParty.map((item) => (
              <div key={item.label} className="bg-om-parchment border border-om-tan rounded-xl p-6 flex items-start gap-4">
                <Shield className="w-6 h-6 text-om-forest flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-base font-display font-semibold text-om-forest-deep mb-1">{item.label}</h3>
                  <p className="text-sm text-om-brown mb-2" style={{ fontFamily: "'EB Garamond', serif" }}>
                    <span className="font-medium text-om-forest-deep">Purpose:</span> {item.what}
                  </p>
                  <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                    <span className="font-medium text-om-forest-deep">Security:</span> {item.security}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Handling */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-4xl mx-auto">
          <div className="bg-om-cream border border-om-tan rounded-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Key className="w-8 h-8 text-om-gold" />
              <h2 className="text-xl md:text-2xl font-display font-semibold text-om-forest-deep">
                How Your Credentials Are Handled
              </h2>
            </div>
            <ul className="space-y-4">
              {[
                'Every API key, email password, and access token is stored as an encrypted server-side secret — never in your browser, never in plain text.',
                'Credentials are only accessed on our secured servers when a task runs. Your browser never sees, handles, or transmits them.',
                'File downloads are served through short-lived, expiring links generated only after confirming you own the message.',
                'Connected social-account tokens are stored encrypted and protected by per-user access policies.',
                'No credentials are ever logged, cached in your browser, or exposed in network responses.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-om-forest flex-shrink-0 mt-0.5" />
                  <span className="text-sm md:text-base text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Trust Banner */}
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
              We take security seriously so you can focus on your outreach, not your infrastructure. Every layer of our platform is designed with your protection in mind.
            </p>
            <button
              onClick={() => onNavigate('contact')}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
            >
              Contact Us
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
