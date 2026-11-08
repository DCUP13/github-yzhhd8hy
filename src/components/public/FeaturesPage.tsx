import React from 'react';
import { PublicLayout } from './PublicLayout';
import { SocialStudioSection } from './SocialStudio';
import {
  Search, Users, FileText, Zap, Bot, BarChart3,
  Send, Mail, Shield, ArrowRight, Database,
  MessageSquare, Instagram, Linkedin, AtSign, UsersRound
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
      title: 'Lead Discovery',
      body: 'Pull prospect contacts from public data sources at scale. Configure your search scope, hit start, and watch contacts populate with names, profile links, and screen names — hundreds in a single run.',
      iconColor: 'text-om-gold',
    },
    {
      icon: Users,
      title: 'Contact Enrichment',
      body: 'Fetch detailed profiles for individual prospects to extract email addresses, phone numbers (cell, business), and business names. Relevant details are automatically linked to each contact for personalized outreach when available.',
      iconColor: 'text-om-forest',
    },
    {
      icon: FileText,
      title: 'Template Builder',
      body: 'Create email and letter templates in HTML, DOCX, or PDF format. Drag-and-drop editor with rich text support. Merge variables organized into Contact Data, Business Data, and Campaign/Sender Data sections. Conditional sections with {{#if}} logic. Import from HTML, DOCX, PDF, or JSON. Export back out when you need.',
      iconColor: 'text-om-mahogany',
    },
    {
      icon: Zap,
      title: 'AI Template Generation',
      body: 'Describe what you want and let AI generate a clean, inline-styled HTML email template. Select which fields are required, important, or optional, and the AI builds the template with proper merge variable syntax and conditional logic built in.',
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
      body: 'When a recipient replies, AI generates a contextually relevant response using your custom prompts. Single-step mode for simple replies. Two-step mode runs an intermediate AI call whose output is injected into the final response. Per-domain enablement so you control which sending addresses auto-respond.',
      iconColor: 'text-om-mahogany',
    },
  ];

  const workflowSteps = [
    { num: '1', icon: Search, title: 'Discover', body: 'Pull prospect contacts from public data sources. Configure your scope, hit start, and watch contacts populate with names, profiles, and screen names.' },
    { num: '2', icon: Users, title: 'Enrich', body: 'Fetch detailed profiles to extract emails, phone numbers, and business info. Relevant details auto-linked to each contact for personalized merge fields.' },
    { num: '3', icon: FileText, title: 'Template', body: 'Build templates with merge variables for contact data, business details, and campaign terms. Use AI generation or the drag-and-drop editor. Preview in test mode.' },
    { num: '4', icon: Send, title: 'Send', body: 'Launch campaigns with time-windowed, throttled sending through your connected email accounts. Atomic queue processing prevents duplicate sends. Daily limits enforced per sender.' },
    { num: '5', icon: BarChart3, title: 'Track', body: 'Monitor delivery, open, click, bounce, and reply rates. Per-sender breakdowns show which accounts perform best. Time-period filtering for trend analysis.' },
    { num: '6', icon: Bot, title: 'Respond', body: 'AI auto-responder handles inbound replies using your custom prompts. Two-step mode for complex scenarios. Drafts saved for review before sending.' },
    { num: '7', icon: Instagram, title: 'Stay Top of Mind', body: 'Weekly prompt plans write and publish posts to Instagram, LinkedIn, and Threads, so your leads keep seeing your name between emails.' },
  ];

  const additionalFeatures = [
    { icon: Mail, title: 'Multi-Sender Routing', body: 'Send through multiple connected email accounts with automatic routing based on the from address. Connect several sender accounts for higher volume and better deliverability.', iconColor: 'text-om-gold' },
    { icon: BarChart3, title: 'Analytics Dashboard', body: 'Track total sent, delivered, opened, clicked, bounced, failed, and complained. Delivery rate, open rate, click rate, bounce rate, and reply rate. Per-sender performance comparison. 7-day, 30-day, and all-time views.', iconColor: 'text-om-forest' },
    { icon: Database, title: 'Data Quality System', body: 'Weighted field scoring with configurable required, important, and optional tiers. Campaigns blocked automatically if data quality falls below your threshold. Placeholder fallback system for missing values. Per-field missing statistics.', iconColor: 'text-om-mahogany' },
    { icon: MessageSquare, title: 'Instagram Autoresponder', body: 'Reply to comments and DMs automatically with keyword rules and multi-step conversation flows. Response delays feel human, and loop prevention stops bots talking to bots.', iconColor: 'text-om-gold-dark' },
    { icon: Bot, title: 'Custom AI Prompts', body: 'Define your own prompts for email, Instagram, LinkedIn, and Threads. Categorize by use case. Two-step mode for complex reply scenarios. Import a saved prompt into any post and tweak it just for that post.', iconColor: 'text-om-forest' },
    { icon: Shield, title: 'Reply Tracking', body: 'Inbound replies linked back to the original campaign email via reply tracking. See which campaigns generate responses. Reply rate calculated across all sent emails. Never lose track of a conversation.', iconColor: 'text-om-mahogany' },
    { icon: Mail, title: 'Threaded Inbox', body: 'Replies are grouped into conversations with read status, open attribution, and link click tracking, so you see the full history with every lead.', iconColor: 'text-om-gold' },
    { icon: UsersRound, title: 'Team Workspace', body: 'Invite team members with roles, chat in-app, and share templates, prompts, and Instagram settings across your organization.', iconColor: 'text-om-forest' },
    { icon: Zap, title: 'Media Library', body: 'Upload photos and videos once. AI picks fresh images for each post and avoids repeating ones you used recently.', iconColor: 'text-om-mahogany' },
  ];

  const integrations = [
    { name: 'Public Data Sources', desc: 'Lead discovery', icon: Search },
    { name: 'Email Delivery', desc: 'Campaign sending', icon: Send },
    { name: 'Connected Mailboxes', desc: 'Send from your address', icon: Mail },
    { name: 'AI Content Engine', desc: 'Smart writing & replies', icon: Bot },
    { name: 'Instagram', desc: 'Posts, comments & DMs', icon: Instagram },
    { name: 'LinkedIn', desc: 'Scheduled posts & analytics', icon: Linkedin },
    { name: 'Threads', desc: 'Multi-post threads', icon: AtSign },
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      {/* Hero */}
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto text-center w-full min-w-0">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Features
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            End-to-End Outreach and Social Automation
          </h1>
          <p
            className="text-xl md:text-2xl text-om-mahogany max-w-3xl mx-auto"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            From finding leads to auto-responding to replies to posting on social, every step of your growth engine in one platform.
          </p>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-7xl mx-auto w-full min-w-0">
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
                  className="bg-om-cream border border-om-tan rounded-xl p-4 sm:p-6 lg:p-8 hover:shadow-lg transition-shadow"
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
        <div className="max-w-6xl mx-auto w-full min-w-0">
          <div className="text-center mb-12">
            <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              The Pipeline
            </p>
            <h2 className="text-3xl md:text-5xl font-display font-semibold text-om-forest-deep mb-6">
              From Lead to Reply
            </h2>
            <p className="text-lg text-om-mahogany max-w-2xl mx-auto" style={{ fontFamily: "'EB Garamond', serif" }}>
              Seven stages, fully automated. Each step feeds the next.
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

      {/* Social Content Studio */}
      <SocialStudioSection detailed onNavigate={onNavigate} />

      {/* Additional Features */}
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-7xl mx-auto w-full min-w-0">
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
        <div className="max-w-5xl mx-auto w-full min-w-0">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-forest-deep mb-4">
              Integrated Capabilities
            </h2>
            <p className="text-lg text-om-mahogany" style={{ fontFamily: "'EB Garamond', serif" }}>
              Connect the tools and services you already use — all in one place.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {integrations.map((integration) => {
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
        <div className="max-w-4xl mx-auto text-center w-full min-w-0">
          <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-6">
            Start Automating Today
          </h2>
          <p className="text-lg md:text-xl text-om-tan mb-8" style={{ fontFamily: "'EB Garamond', serif" }}>
            Get started free and see the difference automated outreach makes.
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
