import React from 'react';
import { PublicLayout } from './PublicLayout';
import {
  MessageSquare, Users, Target, BarChart3, FileText, Instagram,
  Send, Mail, Bot, CheckCircle2, ArrowRight, Database, Clock, Shield, Zap
} from 'lucide-react';

interface FeaturesPageProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function FeaturesPage({ currentPage, onNavigate }: FeaturesPageProps) {
  const features = [
    {
      icon: Bot,
      title: 'AI Two-Step Auto-Responder',
      desc: 'When a prospect replies, the AI works in two steps. Step 1 analyzes the email — understanding intent, extracting context, and identifying what the sender is asking. Step 2 writes a polished, human-sounding reply that references the conversation, injects your business data, and moves the deal forward.',
      points: [
        'Context-aware reply generation from prompt chains',
        'Business data injection: name, phone, city, offer terms, EMD, option period',
        'Conversation history placeholders so replies reference prior messages',
        'Editable prompts — tune the AI to match your voice and style',
      ],
    },
    {
      icon: Users,
      title: 'Smart Contact Discovery',
      desc: 'Stop buying stale lead lists. LoiBlast scrapes fresh real estate agent contacts directly from the source — across every city in all 50 states. Team leads and team members are automatically linked, listings are captured, and every contact gets a data-quality score so you only email verified, high-value prospects.',
      points: [
        'Scrape by city and state — target any market in the US',
        'Automatic team-lead and team-member relationship mapping',
        'Listing data captured per contact: price, beds, baths, brokerage',
        'Data-quality scoring with smart fallbacks for missing fields',
      ],
    },
    {
      icon: Target,
      title: 'Campaign Automation',
      desc: 'Build campaigns that run themselves. Set your target city, attach templates, choose sender addresses, and configure the rules — subject line rotation, send-time windows, delays between emails, offer pricing, and data-quality thresholds. The job queue handles delivery on schedule, and test mode lets you preview before going live.',
      points: [
        'Subject line rotation across multiple variants',
        'Send-time windows and inter-email delays for natural pacing',
        'Offer pricing as percentage or fixed value',
        'Minimum data-quality score gate with skip-incomplete toggle',
        'Test mode to send to yourself before launching',
      ],
    },
    {
      icon: BarChart3,
      title: 'Email Tracking & Analytics',
      desc: 'See exactly what happens after you hit send. Track unique and total opens, click events, delivery and bounce status, and replies — all in real time. View per-sender performance, see trend charts over 7 and 30-day windows, and know which campaigns and templates actually convert.',
      points: [
        'Real-time open tracking with repeat-open counts',
        'Click tracking and last-click timestamps',
        'Delivery, bounce, and complaint status per email',
        'Reply counting with full conversation thread views',
        'Trend charts over 7-day and 30-day windows',
      ],
    },
    {
      icon: FileText,
      title: 'Template Studio',
      desc: 'A drag-and-drop rich text editor with everything you need to create professional outreach templates. Export to DOCX or PDF, generate templates with AI, and use smart variable fallbacks so a missing field never breaks your email. Import existing documents and start sending in minutes.',
      points: [
        'Drag-and-drop editor with image placement and resizing',
        'AI-powered template generation from a prompt',
        'DOCX and PDF export for offline use',
        'Smart variable fallbacks for incomplete contact data',
        'Import .docx files and convert them to templates',
      ],
    },
    {
      icon: Instagram,
      title: 'Instagram Engagement',
      desc: 'Your leads are on Instagram too. LoiBlast connects via webhook to pull comments and DMs into a unified inbox, set up auto-comment rules triggered by keywords, and schedule posts — all from the same dashboard where you manage your email campaigns.',
      points: [
        'Webhook-driven inbox for Instagram comments and DMs',
        'Auto-comment rules triggered by configurable keywords',
        'Post scheduling from within the platform',
        'Unified inbox — email and Instagram side by side',
      ],
    },
    {
      icon: Send,
      title: 'Multi-Provider Sending',
      desc: 'Connect Amazon SES for high-volume delivery and Gmail SMTP for warm inboxes. Manage multiple sender addresses and domains, rotate senders across campaigns automatically, and track per-account sending limits so you never hit a cap mid-campaign.',
      points: [
        'Amazon SES and Gmail SMTP support',
        'Multiple sender addresses and domain management',
        'Automatic sender rotation across campaigns',
        'Per-account daily send limits and remaining balance tracking',
      ],
    },
    {
      icon: Zap,
      title: 'Unified Dashboard',
      desc: 'One login, one sidebar, everything connected. See emails remaining, accounts active, campaigns running, templates saved, and delivery analytics — all on your home dashboard. Navigate between campaigns, contacts, inbox, prompts, analytics, and settings without ever switching tools.',
      points: [
        'Single dashboard with overview stats and email performance',
        'Sidebar navigation across every module',
        'Dark mode that syncs to your account',
        'Test mode for safe experimentation',
      ],
    },
  ];

  return (
    <PublicLayout currentPage={currentPage} onNavigate={onNavigate}>
      <section className="bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Features Built to{' '}
            <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              Win More Deals
            </span>
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Every feature in LoiBlast is designed to remove a step from your workflow — from finding prospects to closing the conversation.
          </p>
        </div>
      </section>

      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            const reversed = i % 2 === 1;
            return (
              <div
                key={i}
                className={`flex flex-col ${reversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-12`}
              >
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{feature.title}</h2>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-6">{feature.desc}</p>
                  <ul className="space-y-3">
                    {feature.points.map((point, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-1 w-full">
                  <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-700 border border-blue-100 dark:border-gray-700 p-8 flex items-center justify-center">
                    <Icon className="w-24 h-24 text-blue-300 dark:text-blue-700" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to put it all to work?</h2>
          <p className="text-lg text-blue-50 mb-8">
            Start your free account and build your first campaign in minutes.
          </p>
          <button
            onClick={() => onNavigate('register')}
            className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-blue-600 bg-white hover:bg-blue-50 rounded-xl shadow-lg transition-all hover:-translate-y-0.5"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>
    </PublicLayout>
  );
}
