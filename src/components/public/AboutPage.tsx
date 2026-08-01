import React from 'react';
import { PublicLayout } from './PublicLayout';
import { ArrowRight, Heart, Target, Shield, Users, Search, TrendingUp } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface AboutPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function AboutPage({ currentRoute, onNavigate }: AboutPageProps) {
  const values = [
    { icon: Search, title: 'Every Lead Matters', body: 'Every agent on Zillow is a potential relationship. We make it possible to reach all of them, not just the ones you have time for.' },
    { icon: Target, title: 'Data Quality First', body: 'Sending to incomplete contacts wastes your sender reputation. Our quality scoring system blocks campaigns when data isn\'t good enough.' },
    { icon: Heart, title: 'Personal at Scale', body: 'Merge fields, conditional sections, and smart fallbacks ensure every email feels hand-written — even when you\'re sending thousands.' },
    { icon: Shield, title: 'Your Data Is Yours', body: 'Row-level security means your contacts, campaigns, and emails are never visible to anyone else. Bank-level encryption on everything.' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      {/* Hero */}
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Our Story
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            Built for Real Estate,
            <br />
            One Lead at a Time
          </h1>
          <p
            className="text-xl md:text-2xl text-om-mahogany max-w-3xl mx-auto"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            We saw real estate professionals drowning in manual outreach — finding leads, writing emails, following up, and still missing opportunities. So we built the platform we wished existed: one that scrapes, enriches, sends, and responds automatically.
          </p>
        </div>
      </section>

      {/* Mantra */}
      <section className="py-14 px-4 sm:px-6 bg-om-forest-deep">
        <div className="max-w-4xl mx-auto">
          <div className="border border-om-forest rounded-xl p-10 text-center">
            <p className="text-sm md:text-base text-om-gold font-medium tracking-widest uppercase mb-4">
              Our Mantra
            </p>
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-4">
              "No Lead Left Behind, No Reply Unanswered"
            </h2>
            <p
              className="text-om-tan text-lg md:text-xl"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              We're committed to helping you reach every agent, send every email, and respond to every reply — without spending your evenings doing it.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-3">
              Our Mission
            </h2>
            <p className="text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
              Why we do what we do
            </p>
          </div>
          <div className="bg-om-parchment border border-om-tan p-10 rounded-xl">
            <p
              className="text-lg md:text-xl text-om-mahogany leading-relaxed text-center"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              Real estate is a relationship business, but building relationships takes time — time you don't have when you're manually searching Zillow for agent contacts, copying email addresses into templates, and hoping you remember to follow up. We built LoiBlast to automate the entire pipeline: finding leads, enriching their data, sending personalized campaigns through your existing email accounts, tracking every open and click, and letting AI handle the replies. Our mission is to give you your time back while making every outreach more personal, not less. Because the best way to grow your business isn't to work harder — it's to let technology handle the repetitive work so you can focus on closing deals.
            </p>
          </div>
        </div>
      </section>

      {/* Built for Real Estate */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              Built for Real Estate
            </h2>
            <p className="text-lg text-om-mahogany max-w-2xl mx-auto" style={{ fontFamily: "'EB Garamond', serif" }}>
              Not a generic email tool with real estate bolted on. Purpose-built from the ground up.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Search, title: 'Zillow-Native', body: 'Scraping built around Zillow\'s API. Agent profiles, property listings, and brokerage data all structured for outreach.' },
              { icon: Users, title: 'Agent-Centric Contacts', body: 'Contacts store screen names, profile URLs, cell/business/brokerage phones, and full agent data from the API.' },
              { icon: TrendingUp, title: 'Outreach Pipeline', body: 'From scrape to send to auto-respond, the entire workflow is designed for real estate cold outreach at scale.' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-om-cream border border-om-tan rounded-xl p-6 text-center">
                  <div className="w-12 h-12 rounded-lg bg-om-parchment border border-om-tan/30 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-om-gold" />
                  </div>
                  <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{item.title}</h3>
                  <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              What Drives Us
            </h2>
            <p className="text-lg text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
              The principles behind every feature we build.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <div key={value.title} className="bg-om-parchment border border-om-tan rounded-xl p-6 text-center">
                  <div className="w-12 h-12 rounded-lg bg-om-cream border border-om-tan/30 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-om-gold" />
                  </div>
                  <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{value.title}</h3>
                  <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>{value.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 px-4 sm:px-6 bg-om-forest">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-6">
            Start Your First Campaign
          </h2>
          <p className="text-lg md:text-xl text-om-tan mb-8" style={{ fontFamily: "'EB Garamond', serif" }}>
            Stop doing manual outreach that AI can handle. Start your free account today.
          </p>
          <button
            onClick={() => onNavigate('contact')}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
          >
            Contact Us
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </PublicLayout>
  );
}
