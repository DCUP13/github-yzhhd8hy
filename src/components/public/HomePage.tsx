import React from 'react';
import { PublicLayout } from './PublicLayout';
import { SocialStudioSection } from './SocialStudio';
import {
  Zap, ArrowRight, Search, Bot, BarChart3,
  Users, Send, FileText, CheckCircle2,
  Instagram, Linkedin, AtSign, CalendarClock
} from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface HomePageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function HomePage({ currentRoute, onNavigate }: HomePageProps) {
  const platformPreview = [
    { icon: Search, label: 'Lead Discovery', sub: 'Find and enrich prospects at scale', iconColor: 'text-om-gold' },
    { icon: Send, label: 'Campaign Automation', sub: 'Time-windowed, throttled email sending', iconColor: 'text-om-forest' },
    { icon: Bot, label: 'AI Autoresponder', sub: 'GPT-4o powered email and Instagram replies', iconColor: 'text-om-mahogany' },
    { icon: CalendarClock, label: 'Social Content Studio', sub: 'Auto-posting to Instagram, LinkedIn, and Threads', iconColor: 'text-om-gold-dark', isNew: true },
  ];

  const stats = [
    { title: '500+ Leads Per Scrape', body: 'Pull prospect contacts directly from public data sources with one click. Names, emails, phone numbers, and business details.' },
    { title: '5000+ Emails Per Day', body: 'Send emails confidently with per-sender daily limits. Talk to the team regarding higher volume.' },
    { title: '85% Reply Automation', body: 'AI auto-responder handles inbound replies using your custom prompts. Two-step mode for complex responses.' },
    { title: 'Full Pipeline Tracking', body: 'Delivery, open, click, bounce, and reply rates tracked per sender. Know exactly what works.' },
    { title: '3 Social Platforms', body: 'Instagram, LinkedIn, and Threads posts written in your voice and published on a weekly plan.' },
  ];

  const features = [
    { icon: Search, title: 'Lead Discovery', body: 'Find prospect contacts from public data sources. Bulk-harvest names, profile URLs, and business info in minutes.' },
    { icon: Users, title: 'Contact Enrichment', body: 'Fetch detailed profiles to extract email addresses, phone numbers, and business names. Relevant details linked to each contact.' },
    { icon: FileText, title: 'Template Builder', body: 'Create HTML, DOCX, or PDF templates with merge variables for contact data, business details, and campaign terms. AI-generated templates available.' },
    { icon: Zap, title: 'Campaign Scheduling', body: 'Set send time windows, per-campaign delays between emails, and test mode for preview drafts. Smart fallbacks for missing data.' },
    { icon: Bot, title: 'AI Autoresponder', body: 'AI generates contextually relevant replies to inbound emails. Single or two-step prompt modes. Per-domain enablement.' },
    { icon: BarChart3, title: 'Analytics Dashboard', body: 'Track delivery, open, click, bounce, and reply rates. Per-sender breakdowns. Time-period filtering for performance trends.' },
    { icon: Instagram, title: 'Instagram Automation', body: 'AI-written captions and carousels with text overlays, plus a comment and DM autoresponder with multi-step conversation flows.' },
    { icon: Linkedin, title: 'LinkedIn Publishing', body: 'Posts drafted in your own voice and scheduled with images, video, or documents. Analytics show what resonates.' },
    { icon: AtSign, title: 'Threads Storytelling', body: 'Hook posts with chained follow-up replies that keep readers scrolling. AI decides how many parts your idea needs.' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      {/* Hero */}
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-7xl mx-auto w-full min-w-0 grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left">
            <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              AI-Powered Outreach Automation
            </p>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep leading-tight mb-6">
              Automate Your Outreach Pipeline
            </h1>
            <p
              className="text-xl md:text-2xl text-om-mahogany mb-10 leading-relaxed"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              Find leads, run personalized email campaigns, and let AI handle the replies. Then keep your name in front of them with AI-written posts for Instagram, LinkedIn, and Threads.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <button
                onClick={() => onNavigate('contact')}
                className="px-8 py-3.5 bg-om-forest text-om-cream hover:bg-om-forest-dark font-medium transition-colors rounded flex items-center justify-center gap-2 shadow-sm"
              >
                Get In Touch
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate('login')}
                className="px-8 py-3.5 border border-om-tan text-om-mahogany hover:border-om-brown hover:text-om-forest-deep font-medium transition-colors rounded"
              >
                Sign In
              </button>
            </div>
          </div>

          {/* Platform Preview Card */}
          <div className="relative">
            <div className="bg-om-parchment border border-om-tan rounded-xl p-4 sm:p-6 lg:p-8 shadow-lg">
              <p className="text-sm md:text-base font-medium text-om-brown uppercase tracking-widest mb-5">
                Platform Preview
              </p>
              <div className="space-y-4">
                {platformPreview.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="bg-om-cream rounded-lg p-4 flex items-center gap-4 border border-om-tan/30"
                    >
                      <Icon className={`w-6 h-6 ${item.iconColor} flex-shrink-0`} />
                      <div>
                        <p className="text-base font-display font-semibold text-om-forest-deep flex items-center gap-2">
                          {item.label}
                          {item.isNew && <span className="rounded-full bg-om-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-om-forest-deep">New</span>}
                        </p>
                        <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>{item.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-14 px-4 sm:px-6 bg-om-forest-deep">
        <div className="max-w-7xl mx-auto w-full min-w-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {stats.map((stat) => (
            <div key={stat.title} className="border border-om-forest rounded-xl p-6">
              <h3 className="text-xl md:text-2xl font-display font-semibold text-om-gold mb-3">{stat.title}</h3>
              <p
                className="text-sm md:text-base text-om-tan leading-relaxed"
                style={{ fontFamily: "'EB Garamond', serif" }}
              >
                {stat.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Preview */}
      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-7xl mx-auto w-full min-w-0">
          <div className="text-center mb-12">
            <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              Features
            </p>
            <h2 className="text-3xl md:text-5xl font-display font-semibold text-om-forest-deep mb-6">
              From Lead to Reply, Automated
            </h2>
            <p
              className="text-xl text-om-mahogany max-w-2xl mx-auto"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              Every step of your outreach and content pipeline in one platform.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-om-parchment border border-om-tan rounded-xl p-4 sm:p-6 lg:p-8 hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 rounded-lg bg-om-cream border border-om-tan/30 flex items-center justify-center mb-5">
                    <Icon className="w-6 h-6 text-om-gold" />
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

          <div className="text-center mt-12">
            <button
              onClick={() => onNavigate('features')}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-om-forest text-om-cream hover:bg-om-forest-dark font-medium transition-colors rounded"
            >
              Explore All Features
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Social Content Studio */}
      <SocialStudioSection onNavigate={onNavigate} />

      {/* How It Works */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-5xl mx-auto w-full min-w-0">
          <div className="text-center mb-12">
            <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              How It Works
            </p>
            <h2 className="text-3xl md:text-5xl font-display font-semibold text-om-forest-deep mb-6">
              Five Steps to Automated Growth
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-6 gap-y-10">
            {[
              { num: '1', icon: Search, title: 'Find Leads', body: 'Pull prospect contacts from public data sources with one click.' },
              { num: '2', icon: FileText, title: 'Build Campaign', body: 'Create templates with merge fields. Preview in test mode.' },
              { num: '3', icon: Send, title: 'Send Emails', body: 'Throttled email sending. Time-windowed delivery.' },
              { num: '4', icon: Bot, title: 'Auto-Respond', body: 'AI handles replies. Track opens, clicks, and responses.' },
              { num: '5', icon: CalendarClock, title: 'Stay Visible', body: 'AI posts to Instagram, LinkedIn, and Threads every week.' },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.num} className="bg-om-cream border border-om-tan rounded-xl p-6 text-center relative">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-om-gold text-om-forest-deep font-display font-bold flex items-center justify-center text-sm">
                    {step.num}
                  </div>
                  <Icon className="w-8 h-8 text-om-forest mx-auto mb-4 mt-2" />
                  <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{step.title}</h3>
                  <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>{step.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 px-4 sm:px-6 bg-om-forest">
        <div className="max-w-4xl mx-auto text-center w-full min-w-0">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-6">
            Ready to Automate Your Outreach?
          </h2>
          <p
            className="text-lg md:text-xl text-om-tan mb-8"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            Join professionals who've automated their outreach pipeline with LoiBlast.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onNavigate('contact')}
              className="px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
            >
              Contact Us
            </button>
            <button
              onClick={() => onNavigate('quiz')}
              className="px-8 py-3.5 border border-om-gold text-om-gold hover:bg-om-gold hover:text-om-forest-deep font-medium transition-colors rounded"
            >
              Take the Quiz
            </button>
          </div>
          <div className="flex items-center justify-center gap-6 mt-8 text-sm text-om-tan" style={{ fontFamily: "'EB Garamond', serif" }}>
            {['No credit card required', 'Cancel anytime', 'Setup in minutes'].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-om-gold" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
