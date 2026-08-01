import React from 'react';
import { PublicLayout } from './PublicLayout';
import { ArrowRight, Heart, Target, Shield, Users } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface AboutPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function AboutPage({ currentRoute, onNavigate }: AboutPageProps) {
  const values = [
    { icon: Heart, title: 'Every Email Matters', body: 'We believe every email deserves a prompt, thoughtful response. No one should be left waiting.' },
    { icon: Target, title: 'Time Is Precious', body: 'Your time should go to what matters most — building relationships, not managing inboxes.' },
    { icon: Shield, title: 'Trust Through Security', body: 'Bank-level encryption and data isolation ensure your communications stay private and secure.' },
    { icon: Users, title: 'Built for Professionals', body: 'Designed by people who understand the demands of client communication and relationship management.' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Our Story
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            Transforming Communities,
            <br />
            One Email at a Time
          </h1>
          <p
            className="text-xl md:text-2xl text-om-mahogany max-w-3xl mx-auto"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            At LoiBlast, we believe that every email matters and every person deserves a prompt, thoughtful response. We're on a mission to ensure no one gets left behind.
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
              "No One Left Behind, No Email Unanswered"
            </h2>
            <p
              className="text-om-tan text-lg md:text-xl"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              We're committed to helping you maintain your reputation by ensuring every email receives the attention it deserves, delivered with care and efficiency.
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
              We built LoiBlast because we saw professionals drowning in email, losing leads to slow responses, and sacrificing their evenings to keep up. We knew AI could solve this — not by replacing the human touch, but by handling the repetitive work so you can focus on what only you can do: building relationships and closing deals. Our mission is to give you your time back while making every conversation better.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              What Drives Us
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <div key={value.title} className="bg-om-cream border border-om-tan rounded-xl p-6 text-center">
                  <div className="w-12 h-12 rounded-lg bg-om-parchment border border-om-tan/30 flex items-center justify-center mx-auto mb-4">
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

      <section className="py-14 px-4 sm:px-6 bg-om-forest">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-6">
            Join the Revolution
          </h2>
          <p className="text-lg md:text-xl text-om-tan mb-8" style={{ fontFamily: "'EB Garamond', serif" }}>
            Stop doing manual work that AI can handle. Start your free account today.
          </p>
          <button
            onClick={() => onNavigate('register')}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </PublicLayout>
  );
}
