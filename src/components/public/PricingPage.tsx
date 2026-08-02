import React from 'react';
import { PublicLayout } from './PublicLayout';
import { Check, Phone, Users, User } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface PricingPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

const individualFeatures = [
  { title: 'One Linked Domain', desc: 'Connect and manage one email domain' },
  { title: 'AI-Powered Autoresponder', desc: 'Automatic email responses with custom prompts' },
  { title: 'Email Draft Generation', desc: 'AI generates drafts for your review' },
  { title: 'Prompt Library', desc: 'Create and save unlimited AI prompts' },
  { title: 'Client CRM', desc: 'Manage contacts and track interactions' },
  { title: 'Zillow Lead Scraping', desc: 'Pull real estate agent contacts via RapidAPI' },
  { title: 'Reply Tracking', desc: 'Monitor email responses and engagement' },
  { title: 'Analytics Dashboard', desc: 'Track email performance and metrics' },
  { title: 'Campaign Automation', desc: 'Schedule and automate outreach campaigns' },
  { title: '1 on 1 Support', desc: 'Direct one-on-one sessions with a dedicated team member' },
  { title: 'Email Support', desc: 'Get help via email within 24 hours' },
  { title: 'Regular Updates', desc: 'Access to all new features and improvements' },
];

const teamFeatures = [
  { title: 'Multiple Linked Domains', desc: 'Connect unlimited email domains for your team' },
  { title: 'Team Member Management', desc: 'Add unlimited team members with role-based access' },
  { title: 'Shared Templates & Prompts', desc: 'Collaborate with team-wide templates and AI prompts' },
  { title: 'Centralized Contact Database', desc: 'Shared CRM across your entire team' },
  { title: 'Advanced Analytics', desc: 'Team performance metrics and detailed reporting' },
  { title: 'Priority Processing', desc: 'Faster email processing and response times' },
  { title: 'Dedicated Training', desc: 'Custom onboarding and training sessions for your team' },
  { title: '1-on-1 Dedicated Support', desc: 'Direct access to your dedicated account manager' },
  { title: 'Priority Feature Requests', desc: 'Influence product roadmap with your feedback' },
  { title: 'SLA Guarantee', desc: '99.9% uptime guarantee with priority support' },
  { title: 'Custom Integrations', desc: 'Work with our team to build custom integrations' },
  { title: 'API Access', desc: 'Programmatic access to all platform features' },
];

export function PricingPage({ currentRoute, onNavigate }: PricingPageProps) {
  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      {/* Hero */}
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-om-gold text-sm font-medium tracking-widest uppercase mb-4">
            Investment
          </p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl md:text-2xl text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
            Please contact us regarding investment and availability. We'll work with you to find the right fit.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6 items-start">

          {/* Individual Card */}
          <div className="bg-om-parchment border border-om-tan rounded-2xl p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-om-cream border border-om-tan flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-om-forest" />
              </div>
              <h2 className="text-2xl font-display font-semibold text-om-forest-deep">Individual</h2>
            </div>
            <p className="text-sm text-om-brown mb-6 leading-relaxed" style={{ fontFamily: "'EB Garamond', serif" }}>
              Perfect for solo professionals and consultants who want to automate their email workflow.
            </p>
            <div className="bg-om-cream border border-om-tan rounded-lg px-4 py-3 mb-5">
              <p className="text-sm text-om-brown italic" style={{ fontFamily: "'EB Garamond', serif" }}>
                Contact us to discuss investment and availability for your situation.
              </p>
            </div>
            <button
              onClick={() => onNavigate('contact')}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-om-forest-deep text-om-cream hover:bg-om-forest font-medium transition-colors rounded-lg mb-8"
            >
              <Phone className="w-4 h-4" />
              Contact Sales
            </button>

            <div className="border-t border-om-tan pt-6">
              <p className="text-xs font-semibold tracking-widest uppercase text-om-gold mb-5">
                What's Included
              </p>
              <ul className="space-y-4">
                {individualFeatures.map((f) => (
                  <li key={f.title} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-om-gold flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-om-forest-deep">{f.title}</p>
                      <p className="text-xs text-om-brown mt-0.5" style={{ fontFamily: "'EB Garamond', serif" }}>{f.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Teams Card */}
          <div className="bg-om-forest-deep border border-om-forest rounded-2xl p-8 flex flex-col relative">
            <div className="absolute top-5 right-5">
              <span className="text-xs font-semibold tracking-wide bg-om-parchment text-om-forest-deep px-3 py-1 rounded border border-om-tan">
                Most Popular
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-om-forest border border-om-forest flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-om-gold" />
              </div>
              <h2 className="text-2xl font-display font-semibold text-om-parchment">Teams</h2>
            </div>
            <p className="text-sm text-om-tan mb-6 leading-relaxed" style={{ fontFamily: "'EB Garamond', serif" }}>
              For agencies and teams that need advanced features, multiple domains, and dedicated support.
            </p>

            <div className="bg-om-forest rounded-xl px-6 py-5 mb-5">
              <p className="text-xs font-semibold tracking-widest uppercase text-om-gold mb-2">
                Custom Pricing
              </p>
              <p className="text-3xl font-display font-semibold text-om-gold mb-1">Contact Sales</p>
              <p className="text-sm text-om-tan" style={{ fontFamily: "'EB Garamond', serif" }}>Tailored to your team's needs</p>
            </div>

            <button
              onClick={() => onNavigate('contact')}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-semibold transition-colors rounded-lg mb-8"
            >
              <Phone className="w-4 h-4" />
              Contact Sales
            </button>

            <div className="border-t border-om-forest pt-6">
              <p className="text-xs font-semibold tracking-widest uppercase text-om-gold mb-5">
                Everything in Individual, Plus:
              </p>
              <ul className="space-y-4">
                {teamFeatures.map((f) => (
                  <li key={f.title} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-om-gold flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-om-parchment">{f.title}</p>
                      <p className="text-xs text-om-tan mt-0.5" style={{ fontFamily: "'EB Garamond', serif" }}>{f.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* CTA */}
      <section className="py-14 px-4 sm:px-6 bg-om-forest">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-6">
            Still Have Questions?
          </h2>
          <p className="text-lg md:text-xl text-om-tan mb-8" style={{ fontFamily: "'EB Garamond', serif" }}>
            Talk to our team or just dive in — it's free to start.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onNavigate('contact')}
              className="px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
            >
              Contact Us
            </button>
            <button
              onClick={() => onNavigate('contact')}
              className="px-8 py-3.5 border border-om-gold text-om-gold hover:bg-om-gold hover:text-om-forest-deep font-medium transition-colors rounded"
            >
              Contact Sales
            </button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
