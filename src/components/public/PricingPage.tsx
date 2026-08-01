import React from 'react';
import { PublicLayout } from './PublicLayout';
import { ArrowRight, Check, Mail, Search, Bot, BarChart3, Instagram, Database, Key } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface PricingPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function PricingPage({ currentRoute, onNavigate }: PricingPageProps) {
  const includedFeatures = [
    { icon: Search, text: 'Zillow lead scraping via RapidAPI' },
    { icon: Mail, text: 'Contact enrichment with email and phone extraction' },
    { icon: Database, text: 'Contact database with property listing data' },
    { icon: Mail, text: 'Unlimited email templates (HTML, DOCX, PDF)' },
    { icon: Bot, text: 'AI template generation with GPT-4o' },
    { icon: Mail, text: 'Campaign automation with test mode and scheduling' },
    { icon: Mail, text: 'Multi-sender routing (Gmail SMTP and Amazon SES)' },
    { icon: Bot, text: 'AI autoresponder with single and two-step modes' },
    { icon: BarChart3, text: 'Full analytics: delivery, opens, clicks, bounces, replies' },
    { icon: Database, text: 'Data quality scoring with campaign gating' },
    { icon: Instagram, text: 'Instagram webhook integration for comments and DMs' },
    { icon: Bot, text: 'Custom AI prompt management' },
    { icon: Mail, text: 'Reply tracking linked to original campaigns' },
    { icon: Database, text: 'Smart placeholder fallback system' },
    { icon: Mail, text: 'Email attachment support with secure S3 storage' },
    { icon: Check, text: 'All updates and new features included' },
  ];

  const whatYouNeed = [
    { icon: Mail, title: 'Gmail or Amazon SES', body: 'For sending emails. Add multiple Gmail accounts (up to 500/day each) or configure Amazon SES (up to 1,440/day per address) for higher volume.' },
    { icon: Key, title: 'RapidAPI Key', body: 'For Zillow lead scraping. Sign up at rapidapi.com, subscribe to the US Housing Market Data API, and paste your API key into settings.' },
    { icon: Bot, title: 'OpenAI API Key', body: 'For AI features. Powers template generation and the autoresponder. Pay-per-use directly through OpenAI.' },
    { icon: Instagram, title: 'Instagram Business Account', body: 'Optional. For social engagement tracking. Connect via Meta\'s Graph API to capture comments, DMs, and mentions.' },
  ];

  const faqs = [
    { q: 'Is there a free trial?', a: 'Yes. Every account starts free — no credit card required. You can scrape leads, build templates, and run test-mode campaigns to see exactly how the platform works before connecting your email accounts.' },
    { q: 'How does the Zillow scraping work?', a: 'You provide a RapidAPI key for the US Housing Market Data API. Configure how many pages to scrape, and LoiBlast pulls real estate agent contacts with names, profile URLs, and screen names. You can then enrich individual contacts with emails and phone numbers.' },
    { q: 'What email providers can I send through?', a: 'LoiBlast supports both Gmail SMTP (up to 500 emails per day per account) and Amazon SES (up to 1,440 emails per day per verified address). You can connect multiple sender accounts for higher volume. The system automatically routes based on the from email address.' },
    { q: 'How does the AI autoresponder work?', a: 'When someone replies to your campaign email, GPT-4o generates a response using your custom prompt. You can use single-step mode for simple replies or two-step mode for complex scenarios. The autoresponder is enabled per SES domain, and generated replies can be saved as drafts for review before sending.' },
    { q: 'What are the AI costs?', a: 'AI features (template generation and autoresponder) use your own OpenAI API key, so you pay OpenAI directly. Costs are based on your usage — typically a few cents per template generated or reply composed. LoiBlast does not add any markup.' },
    { q: 'Is there a limit on contacts?', a: 'No. You can scrape and store as many contacts as your Zillow API plan allows. The data quality system helps you prioritize which contacts are ready for campaigns based on field completeness.' },
    { q: 'Can I change my plan later?', a: 'Absolutely. You can upgrade, downgrade, or cancel at any time from your account settings. There are no long-term contracts.' },
    { q: 'Do you offer team discounts?', a: 'Yes. We offer volume pricing for teams. Contact us for a custom quote.' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      {/* Hero */}
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
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              What's Included
            </h2>
            <p className="text-lg text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
              Every feature, every integration, no hidden fees.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {includedFeatures.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="flex items-start gap-3 bg-om-cream border border-om-tan rounded-lg p-4">
                  <Icon className="w-5 h-5 text-om-gold flex-shrink-0 mt-0.5" />
                  <span className="text-sm md:text-base text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                    {item.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What You'll Need */}
      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              What You'll Need
            </h2>
            <p className="text-lg text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
              LoiBlast connects to your existing accounts. Here's what to bring.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {whatYouNeed.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-om-parchment border border-om-tan rounded-xl p-6 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-om-cream border border-om-tan/30 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6 text-om-forest" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{item.title}</h3>
                    <p className="text-sm text-om-brown leading-relaxed" style={{ fontFamily: "'EB Garamond', serif" }}>{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-10 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="bg-om-cream border border-om-tan rounded-xl p-6">
                <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{faq.q}</h3>
                <p className="text-sm md:text-base text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                  {faq.a}
                </p>
              </div>
            ))}
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
