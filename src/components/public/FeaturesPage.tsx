import React from 'react';
import { PublicLayout } from './PublicLayout';
import {
  Search, Users, FileText, Zap, Bot, BarChart3,
  Send, Mail, Instagram, Shield, ArrowRight, Database,
  Clock, CheckCircle2, Globe, MessageSquare
} from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface FeaturesPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function FeaturesPage({ currentRoute, onNavigate }: FeaturesPageProps) {
  const coreFeatures = [
    {
      icon: Search,
      title: 'Zillow Lead Scraping',
      body: 'Scrape real estate agent listings directly from Zillow\'s US Housing Market Data API. Configure your API key, set the number of pages to scrape, and pull hundreds of agent contacts with one click. Each contact includes name, profile URL, and screen name.',
      iconColor: 'text-om-gold',
    },
    {
      icon: Users,
      title: 'Contact Enrichment',
      body: 'Fetch detailed profiles for individual agents to extract email addresses, phone numbers (cell, business, brokerage), and business names. Property listings are automatically linked to each contact, giving you address, price, bedrooms, bathrooms, square footage, and listing URL for personalized outreach.',
      iconColor: 'text-om-forest',
    },
    {
      icon: FileText,
      title: 'Template Builder',
      body: 'Create email and letter templates in HTML, DOCX, or PDF format. Drag-and-drop editor with rich text support. Merge variables organized into Contact Data, Listing Data, and Campaign/Sender Data sections. Conditional sections with {{#if}} logic. Import from HTML, DOCX, PDF, or JSON. Export back out when you need.',
      iconColor: 'text-om-mahogany',
    },
    {
      icon: Zap,
      title: 'AI Template Generation',
      body: 'Describe what you want and let GPT-4o generate a clean, inline-styled HTML email template. Select which fields are required, important, or optional, and the AI builds the template with proper merge variable syntax and conditional logic built in.',
      iconColor: 'text-om-gold-dark',
    },
    {
      icon: Send,
      title: 'Campaign Automation',
      body: 'Link templates to contacts and launch campaigns with full control. Test mode generates preview drafts before going live. Set daily send time windows. Configure per-campaign delays between emails. Smart fallbacks replace missing data with configured text instead of sending broken templates.',
      iconColor: 'text-om-forest',
    },
    {
      icon: Bot,
      title: 'AI Autoresponder',
      body: 'When a recipient replies, GPT-4o generates a contextually relevant response using your custom prompts. Single-step mode for simple replies. Two-step mode runs an intermediate AI call whose output is injected into the final response. Per-domain enablement so you control which sending addresses auto-respond.',
      iconColor: 'text-om-mahogany',
    },
  ];

  const workflowSteps = [
    { num: '1', icon: Search, title: 'Scrape', body: 'Pull agent contacts from Zillow via RapidAPI. Configure pages, hit start, and watch contacts populate with names, profiles, and screen names.' },
    { num: '2', icon: Users, title: 'Enrich', body: 'Fetch detailed profiles to extract emails, phone numbers, and brokerage info. Property listings auto-linked to each contact for personalized merge fields.' },
    { num: '3', icon: FileText, title: 'Template', body: 'Build templates with merge variables for contact data, listing details, and campaign terms. Use AI generation or the drag-and-drop editor. Preview in test mode.' },
    { num: '4', icon: Send, title: 'Send', body: 'Launch campaigns with time-windowed, throttled sending through Gmail or Amazon SES. Atomic queue processing prevents duplicate sends. Daily limits enforced per sender.' },
    { num: '5', icon: BarChart3, title: 'Track', body: 'Monitor delivery, open, click, bounce, and reply rates. Per-sender breakdowns show which accounts perform best. Time-period filtering for trend analysis.' },
    { num: '6', icon: Bot, title: 'Respond', body: 'AI auto-responder handles inbound replies using your custom prompts. Two-step mode for complex scenarios. Drafts saved for review before sending.' },
  ];

  const additionalFeatures = [
    { icon: Mail, title: 'Multi-Sender Routing', body: 'Send through Gmail SMTP (up to 500/day per account) or Amazon SES (up to 1,440/day per address). Automatic provider routing based on the from email address. Multiple sender accounts for higher volume.', iconColor: 'text-om-gold' },
    { icon: BarChart3, title: 'Analytics Dashboard', body: 'Track total sent, delivered, opened, clicked, bounced, failed, and complained. Delivery rate, open rate, click rate, bounce rate, and reply rate. Per-sender performance comparison. 7-day, 30-day, and all-time views.', iconColor: 'text-om-forest' },
    { icon: Database, title: 'Data Quality System', body: 'Weighted field scoring with configurable required, important, and optional tiers. Campaigns blocked automatically if data quality falls below your threshold. Placeholder fallback system for missing values. Per-field missing statistics.', iconColor: 'text-om-mahogany' },
    { icon: Instagram, title: 'Instagram Integration', body: 'Connect your Instagram Business or Creator account. Webhook capture of comments, direct messages, and mentions. All engagement events stored with sender info, message text, and media references.', iconColor: 'text-om-gold-dark' },
    { icon: MessageSquare, title: 'Custom AI Prompts', body: 'Define your own prompts for the autoresponder. Categorize by use case. Add business data context. Two-step mode for complex reply scenarios. AI-assisted prompt generation by category.', iconColor: 'text-om-forest' },
    { icon: Shield, title: 'Reply Tracking', body: 'Inbound replies linked back to the original campaign email via reply tracking. See which campaigns generate responses. Reply rate calculated across all sent emails. Never lose track of a conversation.', iconColor: 'text-om-mahogany' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      {/* Hero */}
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Features
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            End-to-End Outreach Automation
          </h1>
          <p
            className="text-xl md:text-2xl text-om-mahogany max-w-3xl mx-auto"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            From finding leads on Zillow to auto-responding to replies, every step of your real estate outreach pipeline in one platform.
          </p>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              Core Platform
            </h2>
            <p className="text-lg text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
              Six pillars that power your outreach pipeline.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coreFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-om-cream border border-om-tan rounded-xl p-8 hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 rounded-lg bg-om-parchment border border-om-tan/30 flex items-center justify-center mb-5">
                    <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-display font-semibold text-om-forest-deep mb-3">{feature.title}</h3>
                  <p
                    className="text-sm md:text-base text-om-brown leading-relaxed"
                    style={{ fontFamily: "'EB Garamond', serif" }}
                  >
                    {feature.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works - Pipeline */}
      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              The Pipeline
            </p>
            <h2 className="text-3xl md:text-5xl font-display font-semibold text-om-forest-deep mb-6">
              From Lead to Reply
            </h2>
            <p className="text-lg text-om-mahogany max-w-2xl mx-auto" style={{ fontFamily: "'EB Garamond', serif" }}>
              Six stages, fully automated. Each step feeds the next.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflowSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.num} className="bg-om-parchment border border-om-tan rounded-xl p-6 relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-om-gold text-om-forest-deep font-display font-bold flex items-center justify-center text-lg flex-shrink-0">
                      {step.num}
                    </div>
                    <Icon className="w-6 h-6 text-om-forest" />
                  </div>
                  <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{step.title}</h3>
                  <p className="text-sm text-om-brown leading-relaxed" style={{ fontFamily: "'EB Garamond', serif" }}>{step.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Additional Features */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              And So Much More
            </h2>
            <p className="text-lg text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
              Everything you need to run professional outreach at scale.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {additionalFeatures.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-om-cream border border-om-tan rounded-xl p-6">
                  <div className="w-12 h-12 rounded-lg bg-om-parchment border border-om-tan/30 flex items-center justify-center mb-5">
                    <Icon className={`w-6 h-6 ${item.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{item.title}</h3>
                  <p className="text-sm text-om-brown leading-relaxed" style={{ fontFamily: "'EB Garamond', serif" }}>{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              Integrations
            </h2>
            <p className="text-lg text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
              LoiBlast connects to the tools you already use.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { name: 'Zillow API', desc: 'Lead scraping', icon: Search },
              { name: 'Amazon SES', desc: 'Email sending', icon: Send },
              { name: 'Gmail SMTP', desc: 'Email sending', icon: Mail },
              { name: 'OpenAI GPT-4o', desc: 'AI responses', icon: Bot },
              { name: 'Instagram', desc: 'Social engagement', icon: Instagram },
            ].map((integration) => {
              const Icon = integration.icon;
              return (
                <div key={integration.name} className="bg-om-parchment border border-om-tan rounded-xl p-5 text-center">
                  <Icon className="w-8 h-8 text-om-forest mx-auto mb-3" />
                  <p className="text-sm font-display font-semibold text-om-forest-deep">{integration.name}</p>
                  <p className="text-xs text-om-brown mt-1" style={{ fontFamily: "'EB Garamond', serif" }}>{integration.desc}</p>
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
            Start Automating Today
          </h2>
          <p className="text-lg md:text-xl text-om-tan mb-8" style={{ fontFamily: "'EB Garamond', serif" }}>
            Get started free and see the difference automated outreach makes.
          </p>
          <button
            onClick={() => onNavigate('quiz')}
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
