import React from 'react';
import { PublicLayout } from './PublicLayout';
import {
  Shield, Lock, Eye, Server, Key, FileCheck,
  ArrowRight, Database, Cloud, AlertTriangle
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
      title: 'Encryption',
      body: 'All data transmission uses TLS/SSL encryption. Passwords are hashed using bcrypt before storage. Database connections are encrypted. SMTP credentials and OAuth tokens are stored encrypted and never exposed to the browser. Your Gmail app passwords and Amazon SES credentials are kept in encrypted edge function secrets, not in client-visible configuration.',
    },
    {
      icon: Server,
      title: 'Row-Level Security',
      body: 'Every database table has row-level security (RLS) enabled with per-user policies. Users can only access their own contacts, campaigns, email templates, sent emails, prompts, and settings. No user can ever query, view, or modify another user\'s data — the database itself enforces this at the query level, not just the application layer.',
    },
    {
      icon: Key,
      title: 'Authentication',
      body: 'Secure session management with JWT tokens through Supabase Auth. Sessions expire automatically and tokens refresh securely. Your account credentials are never stored in plain text. Optional two-factor authentication available from your account settings.',
    },
    {
      icon: Eye,
      title: 'Data Isolation',
      body: 'Complete data isolation between accounts. Your scraped Zillow contacts, campaign templates, sent email history, AI prompts, Instagram webhook events, and analytics are never shared with or accessible by other users. Each user\'s data lives in its own secured partition.',
    },
    {
      icon: FileCheck,
      title: 'Compliance',
      body: 'GDPR and CCPA compliant data handling. Clear data retention policies. Full data export and deletion capabilities on request. Email content processed by OpenAI for AI features is handled in accordance with OpenAI\'s data usage policies and our Privacy Policy.',
    },
    {
      icon: Database,
      title: 'Data Quality Protection',
      body: 'The data quality scoring system prevents campaigns from running when contact data is incomplete or below your configured threshold. This protects your sender reputation by ensuring you never send emails to contacts with missing names, broken email addresses, or insufficient personalization data.',
    },
  ];

  const thirdParty = [
    { name: 'Amazon SES', what: 'Sends your outbound emails', security: 'AWS-managed infrastructure with TLS encryption. Your SES SMTP credentials stored as encrypted edge function secrets.' },
    { name: 'Gmail SMTP', what: 'Sends through your Gmail accounts', security: 'App-specific passwords with 16-character authentication. Credentials stored encrypted, never logged.' },
    { name: 'OpenAI (GPT-4o)', what: 'Powers AI template generation and autoresponder', security: 'Your OpenAI API key stored as an edge function secret. Email content sent to OpenAI only when AI features are used, in accordance with their data policies.' },
    { name: 'RapidAPI / Zillow', what: 'Provides agent listing data for lead scraping', security: 'Your RapidAPI key stored as an edge function secret. Only used server-side to fetch public agent listing data.' },
    { name: 'AWS S3', what: 'Stores email attachments', security: 'Presigned URLs with 1-hour expiry for downloads. Credentials never exposed to the browser. Access verified per-user before URLs are generated.' },
    { name: 'Instagram / Meta', what: 'Captures social engagement events', security: 'Long-lived access tokens stored encrypted. Webhook verification with verify tokens. Event deduplication to prevent processing duplicates.' },
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
            Enterprise-grade security built into every layer — from the database to the email queue to the AI processing pipeline.
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
              Third-Party Security
            </h2>
            <p className="text-lg text-om-mahogany max-w-2xl mx-auto" style={{ fontFamily: "'EB Garamond', serif" }}>
              How each integration handles your data.
            </p>
          </div>
          <div className="space-y-4">
            {thirdParty.map((item) => (
              <div key={item.name} className="bg-om-parchment border border-om-tan rounded-xl p-6 flex items-start gap-4">
                <Shield className="w-6 h-6 text-om-forest flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-base font-display font-semibold text-om-forest-deep mb-1">{item.name}</h3>
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

      {/* API Key Handling */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-4xl mx-auto">
          <div className="bg-om-cream border border-om-tan rounded-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Key className="w-8 h-8 text-om-gold" />
              <h2 className="text-xl md:text-2xl font-display font-semibold text-om-forest-deep">
                How Your API Keys Are Handled
              </h2>
            </div>
            <ul className="space-y-4">
              {[
                'All API keys (OpenAI, RapidAPI, Amazon SES, Gmail app passwords) are stored as encrypted edge function secrets on the server, never in the browser.',
                'Keys are only accessed server-side when executing edge functions — your browser never sees or handles them directly.',
                'AWS credentials for attachment downloads use Signature V4 presigned URLs with 1-hour expiry, generated server-side after verifying ownership.',
                'Instagram access tokens are stored encrypted in the database with row-level security policies.',
                'No API keys or credentials are ever logged, cached in the browser, or exposed in network responses.',
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
              We take security seriously so you can focus on your outreach, not your infrastructure. Every layer of LoiBlast — from the database to the email queue to the AI pipeline — is designed with protection in mind.
            </p>
            <button
              onClick={() => onNavigate('quiz')}
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
