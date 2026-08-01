import React from 'react';
import { PublicLayout } from './PublicLayout';
import {
  Bot, FileText, Mail, Zap, Send, BarChart3,
  Users, Clock, Shield, ArrowRight, Calendar, MessageSquare
} from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface FeaturesPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function FeaturesPage({ currentRoute, onNavigate }: FeaturesPageProps) {
  const features = [
    { icon: Bot, title: 'Smart Autoresponder', body: 'AI-powered automatic responses that understand context and tone. Set up custom rules for different types of emails and let the system handle routine communications while you focus on what matters.', iconColor: 'text-om-gold' },
    { icon: FileText, title: 'Draft Generation', body: 'Automatically generate email drafts based on incoming messages. Review and send with one click, or customise as needed. Save hours on email composition with AI assistance.', iconColor: 'text-om-forest' },
    { icon: Mail, title: 'Email Templates', body: 'Create, save, and reuse professional email templates. Rich text editor with drag-and-drop support, image handling, and export to PDF or DOCX. Perfect for standardised communications.', iconColor: 'text-om-mahogany' },
    { icon: Zap, title: 'Custom Prompts', body: 'Define your own AI prompts to guide how emails are processed and responded to. Tailor the automation to match your business voice and requirements perfectly.', iconColor: 'text-om-gold-dark' },
    { icon: Send, title: 'Reply Tracking', body: 'Track which emails have been replied to and which are still pending. Never miss a follow-up with automatic tracking of all your email conversations.', iconColor: 'text-om-forest' },
    { icon: BarChart3, title: 'Smart Notifications', body: 'Get notified about important emails only. Intelligent filtering ensures you\'re alerted to priority messages while routine communications are handled automatically.', iconColor: 'text-om-mahogany' },
  ];

  const highlights = [
    { icon: Users, title: 'Client Management', body: 'Track all client interactions, manage contacts, and keep detailed notes in one place.', iconColor: 'text-om-mahogany' },
    { icon: Clock, title: 'Time Savings', body: 'Save 15+ hours per week by automating repetitive email tasks and responses.', iconColor: 'text-om-gold-dark' },
    { icon: Shield, title: 'Enterprise Security', body: 'Bank-level encryption, row-level security, and complete data isolation for your peace of mind.', iconColor: 'text-om-forest' },
    { icon: BarChart3, title: 'Analytics Dashboard', body: 'Track your email performance, response rates, and productivity metrics in real-time.', iconColor: 'text-om-gold' },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Features
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            Powerful Tools for Modern Professionals
          </h1>
          <p
            className="text-xl md:text-2xl text-om-mahogany max-w-3xl mx-auto"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            Every feature is designed to save you time and keep your communications flowing seamlessly.
          </p>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
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
      </section>

      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              And So Much More
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-om-parchment border border-om-tan rounded-xl p-6 text-center">
                  <div className="w-12 h-12 rounded-lg bg-om-cream border border-om-tan/30 flex items-center justify-center mx-auto mb-4">
                    <Icon className={`w-6 h-6 ${item.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-display font-semibold text-om-forest-deep mb-2">{item.title}</h3>
                  <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-om-forest">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-6">
            Start Automating Today
          </h2>
          <p className="text-lg md:text-xl text-om-tan mb-8" style={{ fontFamily: "'EB Garamond', serif" }}>
            Get started free and see the difference AI-powered email automation makes.
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
