import React from 'react';
import { PublicLayout } from './PublicLayout';
import { ArrowRight, Check } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface PricingPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function PricingPage({ currentRoute, onNavigate }: PricingPageProps) {
  const faqs = [
    { q: 'Is there a free trial?', a: 'Yes. Every plan starts free — no credit card required. You can explore the platform and see the difference before committing.' },
    { q: 'Can I change my plan later?', a: 'Absolutely. You can upgrade, downgrade, or cancel your plan at any time from your account settings.' },
    { q: 'What payment methods do you accept?', a: 'We accept all major credit cards. Enterprise plans can also pay by invoice with NET-30 terms.' },
    { q: 'Do you offer team discounts?', a: 'Yes. We offer volume pricing for teams. Contact us for a custom quote.' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Investment
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            Simple, Transparent Pricing
          </h1>
          <p
            className="text-xl md:text-2xl text-om-mahogany max-w-3xl mx-auto"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            Please contact us regarding investment and availability. We'll work with you to find the right fit.
          </p>
          <div className="mt-8">
            <button
              onClick={() => onNavigate('contact')}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-om-forest text-om-cream hover:bg-om-forest-dark font-medium transition-colors rounded"
            >
              Contact Us
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-10 text-center">
            What's Included
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              'AI-powered email automation and auto-responses',
              'Unlimited email templates with rich text editor',
              'Custom AI prompts tailored to your business',
              'Reply tracking and smart notifications',
              'Client management and CRM integration',
              'Calendar sync and automated reminders',
              'Advanced analytics and performance insights',
              'Enterprise-grade security and data encryption',
              'Priority email support',
              'All updates and new features included',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 bg-om-cream border border-om-tan rounded-lg p-4">
                <Check className="w-5 h-5 text-om-gold flex-shrink-0 mt-0.5" />
                <span className="text-sm md:text-base text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-10 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="bg-om-parchment border border-om-tan rounded-xl p-6">
                <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{faq.q}</h3>
                <p className="text-sm md:text-base text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
              onClick={() => onNavigate('register')}
              className="px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
            >
              Get Started Free
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
