import React from 'react';
import { PublicLayout } from './PublicLayout';
import {
  Zap, Calendar, Users, ArrowRight, Bot, FileText, BarChart3,
  Shield, Send, Mail, Clock, TrendingUp, CheckCircle2
} from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface HomePageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function HomePage({ currentRoute, onNavigate }: HomePageProps) {
  const platformPreview = [
    { icon: Zap, label: 'Automated Responses', sub: 'AI handles 85% of inquiries', iconColor: 'text-om-gold' },
    { icon: Calendar, label: 'Calendar Sync', sub: 'Never miss an appointment', iconColor: 'text-om-forest' },
    { icon: Users, label: 'CRM Integration', sub: 'Track every interaction', iconColor: 'text-om-mahogany' },
  ];

  const stats = [
    { title: '85% Automated', body: 'AI handles the majority of your email responses, ensuring no lead goes cold.' },
    { title: '3x More Leads Converted', body: 'Never miss a follow-up. Automated reminders and smart categorisation keep you on top of every opportunity.' },
    { title: '15+ Hours Saved Weekly', body: 'Focus on high-value activities while automation handles routine tasks and email management.' },
    { title: 'Zero Missed Appointments', body: 'Calendar sync and automated reminders ensure you\'re always prepared and on time.' },
  ];

  const features = [
    { icon: Bot, title: 'Smart Autoresponder', body: 'AI-powered automatic responses that understand context and tone. Set up custom rules for different types of emails and let the system handle routine communications while you focus on what matters.' },
    { icon: FileText, title: 'Draft Generation', body: 'Automatically generate email drafts based on incoming messages. Review and send with one click, or customise as needed. Save hours on email composition with AI assistance.' },
    { icon: Mail, title: 'Email Templates', body: 'Create, save, and reuse professional email templates. Rich text editor with drag-and-drop support, image handling, and export to PDF or DOCX. Perfect for standardised communications.' },
    { icon: Zap, title: 'Custom Prompts', body: 'Define your own AI prompts to guide how emails are processed and responded to. Tailor the automation to match your business voice and requirements perfectly.' },
    { icon: Send, title: 'Reply Tracking', body: 'Track which emails have been replied to and which are still pending. Never miss a follow-up with automatic tracking of all your email conversations.' },
    { icon: BarChart3, title: 'Smart Notifications', body: 'Get notified about important emails only. Intelligent filtering ensures you\'re alerted to priority messages while routine communications are handled automatically.' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      {/* Hero */}
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left">
            <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              AI-Powered Email Automation
            </p>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep leading-tight mb-6">
              Transform Your Email Management
            </h1>
            <p
              className="text-xl md:text-2xl text-om-mahogany mb-10 leading-relaxed"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              Automate responses, manage clients, and sync your calendar. Save hours every day with AI-powered email automation that learns from your business.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <button
                onClick={() => onNavigate('register')}
                className="px-8 py-3.5 bg-om-forest text-om-cream hover:bg-om-forest-dark font-medium transition-colors rounded flex items-center justify-center gap-2 shadow-sm"
              >
                Get Started
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
            <div className="bg-om-parchment border border-om-tan rounded-xl p-8 shadow-lg">
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
                        <p className="text-base font-display font-semibold text-om-forest-deep">{item.label}</p>
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
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              Features
            </p>
            <h2 className="text-3xl md:text-5xl font-display font-semibold text-om-forest-deep mb-6">
              Everything You Need
            </h2>
            <p
              className="text-xl text-om-mahogany max-w-2xl mx-auto"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              Powerful tools to automate your workflow and grow your business.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-om-parchment border border-om-tan rounded-xl p-8 hover:shadow-lg transition-shadow"
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

      {/* CTA */}
      <section className="py-14 px-4 sm:px-6 bg-om-forest">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-6">
            Ready to Transform Your Email Management?
          </h2>
          <p
            className="text-lg md:text-xl text-om-tan mb-8"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            Join the professionals who've automated their workflow with LoiBlast.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onNavigate('register')}
              className="px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
            >
              Get Started Free
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
