import React from 'react';
import { PublicLayout } from './PublicLayout';
import {
  Search, Mail, MessageSquare, BarChart3, FileText, Instagram,
  Send, Users, Zap, ArrowRight, CheckCircle2, Bot, Calendar, Target, TrendingUp
} from 'lucide-react';

interface HomePageProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function HomePage({ currentPage, onNavigate }: HomePageProps) {
  const stats = [
    { value: '85%', label: 'of replies handled by AI' },
    { value: '15+', label: 'hours saved every week' },
    { value: '50', label: 'states covered for prospecting' },
    { value: '1', label: 'platform — email, Instagram, CRM' },
  ];

  const steps = [
    {
      icon: Search,
      title: 'Discover',
      desc: 'Automatically scrape targeted real estate agent contacts by city and state. Team leads, team members, listings, and verified emails — all captured for you.',
    },
    {
      icon: Send,
      title: 'Engage',
      desc: 'AI writes and sends personalized email campaigns with tracked opens, clicks, and replies. Rotate subject lines, schedule send windows, and let the queue handle delivery.',
    },
    {
      icon: Bot,
      title: 'Convert',
      desc: 'Two-step AI auto-responds to incoming replies with context-aware messages. Manage Instagram comments and DMs from the same inbox. Close more deals on autopilot.',
    },
  ];

  const features = [
    { icon: MessageSquare, title: 'AI Two-Step Auto-Responder', desc: 'Step 1 analyzes the email. Step 2 writes a polished, context-aware reply — automatically.' },
    { icon: Users, title: 'Smart Contact Discovery', desc: 'Scrape agent contacts across all 50 states with team relationships and listing data included.' },
    { icon: Target, title: 'Campaign Automation', desc: 'Target any US city, set time windows, delays, subject rotation, and offer terms — then let it run.' },
    { icon: BarChart3, title: 'Email Tracking & Analytics', desc: 'Real-time opens, clicks, replies, delivery rates, and trend charts over 7/30-day windows.' },
    { icon: FileText, title: 'Template Studio', desc: 'Drag-and-drop editor with DOCX/PDF export, AI generation, and smart variable fallbacks.' },
    { icon: Instagram, title: 'Instagram Engagement', desc: 'Webhook-driven inbox for comments and DMs, auto-comment rules, and post scheduling.' },
  ];

  return (
    <PublicLayout currentPage={currentPage} onNavigate={onNavigate}>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 via-white to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 pt-20 pb-24">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 -right-20 w-72 h-72 bg-blue-200 dark:bg-blue-900/20 rounded-full blur-3xl opacity-40" />
          <div className="absolute bottom-0 -left-20 w-96 h-96 bg-blue-100 dark:bg-blue-900/10 rounded-full blur-3xl opacity-50" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            From discovery to deal — fully automated
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-tight max-w-4xl mx-auto mb-6">
            AI That Prospects, Writes, Sends, and{' '}
            <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              Replies For You
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            LoiBlast handles your entire outreach pipeline — from finding agent contacts to AI-writing personalized emails to auto-responding to replies and managing Instagram. All in one dashboard.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('register')}
              className="px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 flex items-center gap-2"
            >
              Start Free Today
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-3.5 text-base font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl transition-all"
            >
              See How It Works
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
              >
                <p className="text-3xl sm:text-4xl font-bold text-blue-600 dark:text-blue-400 mb-1">{stat.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Three Steps to More Deals
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              No more manual prospecting, copy-paste emails, or missed replies. LoiBlast automates the boring 80% so you focus on closing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={i}
                  className="relative bg-gray-50 dark:bg-gray-800 rounded-2xl p-8 hover:shadow-lg transition-all hover:-translate-y-1"
                >
                  <div className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-lg">
                    {i + 1}
                  </div>
                  <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
                    <Icon className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{step.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Feature Preview Grid */}
      <section className="py-24 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need in One Platform
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Stop juggling separate tools. LoiBlast unifies prospecting, email outreach, auto-responding, and social engagement.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all"
                >
                  <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{feature.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <button
              onClick={() => onNavigate('features')}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              Explore all features
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-24 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Trusted by Agents Nationwide
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Real estate professionals in all 50 states use LoiBlast to grow their pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { quote: "I went from sending 20 emails a day manually to 500 on autopilot. The AI replies alone save me 15 hours a week.", name: "Marcus T.", role: "Real Estate Broker, Phoenix AZ" },
              { quote: "The contact scraper is a game changer. I targeted Dallas agents and had 200 verified emails in minutes. Three deals closed from one campaign.", name: "Sarah L.", role: "Agent, Dallas TX" },
              { quote: "Having email and Instagram engagement in one dashboard means I never miss a lead. The auto-responder sounds like me, not a robot.", name: "David R.", role: "Team Lead, Miami FL" },
            ].map((t, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-6 italic">"{t.quote}"</p>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-gradient-to-r from-blue-600 to-blue-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Stop Chasing Leads. Start Closing Deals.
          </h2>
          <p className="text-lg text-blue-50 mb-8 max-w-2xl mx-auto">
            Join the agents who've automated their outreach and reclaimed their time. Get started free — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('register')}
              className="px-8 py-3.5 text-base font-semibold text-blue-600 bg-white hover:bg-blue-50 rounded-xl shadow-lg transition-all hover:-translate-y-0.5 flex items-center gap-2"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => onNavigate('pricing')}
              className="px-8 py-3.5 text-base font-semibold text-white border-2 border-white/40 hover:border-white rounded-xl transition-all"
            >
              View Pricing
            </button>
          </div>
          <div className="flex items-center justify-center gap-6 mt-8 text-sm text-blue-100">
            {['No credit card required', 'Cancel anytime', 'Setup in minutes'].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
