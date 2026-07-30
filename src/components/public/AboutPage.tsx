import React from 'react';
import { PublicLayout } from './PublicLayout';
import { ArrowRight, Clock, TrendingUp, Users, Layers, Target, Zap } from 'lucide-react';

interface AboutPageProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function AboutPage({ currentPage, onNavigate }: AboutPageProps) {
  const values = [
    { icon: Clock, title: 'Time Saved', desc: 'Reclaim 15+ hours every week by automating prospecting, email writing, and reply handling.' },
    { icon: TrendingUp, title: 'Higher Reply Rates', desc: 'AI-personalized emails and instant auto-replies mean prospects hear back before they lose interest.' },
    { icon: Target, title: 'No More Cold Calling', desc: 'Start warm. Every contact is verified with data-quality scoring before a single email goes out.' },
    { icon: Layers, title: 'Everything in One Place', desc: 'Email, Instagram, contacts, templates, analytics — one login, one dashboard, zero tool-hopping.' },
  ];

  return (
    <PublicLayout currentPage={currentPage} onNavigate={onNavigate}>
      <section className="bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            We Built LoiBlast Because{' '}
            <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              Outreach Shouldn't Be Manual
            </span>
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            Real estate is a relationship business — but the work of finding those relationships is repetitive, slow, and drains the energy you need for closing. We set out to fix that.
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">The Problem We Saw</h2>
          <div className="prose prose-lg max-w-none text-gray-600 dark:text-gray-400 leading-relaxed space-y-4">
            <p>
              Every real estate professional knows the grind: spend hours scrolling agent directories, copy-pasting contact info into a spreadsheet, writing the same email for the hundredth time, then manually following up with every reply — if you even get to it before the lead goes cold.
            </p>
            <p>
              The tools on the market only solve part of the problem. Email platforms don't find contacts. CRMs don't write emails. Instagram tools don't talk to your email campaigns. You end up juggling five subscriptions, copying data between them, and still doing the manual work they were supposed to eliminate.
            </p>
            <p>
              We knew there had to be a better way — one platform that handles the entire pipeline from discovery to deal.
            </p>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="py-20 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">Why We Built This</h2>
          <div className="prose prose-lg max-w-none text-gray-600 dark:text-gray-400 leading-relaxed space-y-4">
            <p>
              LoiBlast was built around one principle: automate the boring 80% so agents can focus on the 20% that actually closes deals — the conversations, the negotiations, the relationships.
            </p>
            <p>
              We started by connecting the pieces no one else had connected. Contact discovery feeds directly into campaign building. Campaigns send through multiple providers with automatic rotation. Replies come back into a unified inbox where AI analyzes and responds in two steps. Instagram engagement sits alongside email so no lead slips through.
            </p>
            <p>
              The result isn't just another email tool or another CRM. It's an end-to-end AI outreach pipeline — and it runs while you sleep.
            </p>
          </div>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-8">What Makes Us Different</h2>
          <div className="space-y-6">
            {[
              {
                title: 'Standalone Email Tools',
                problem: 'They send emails — but they don\'t find your contacts. You still buy lead lists or scrape manually.',
                solution: 'LoiBlast scrapes fresh agent contacts across all 50 states and feeds them directly into your campaigns.',
              },
              {
                title: 'Standalone CRMs',
                problem: 'They store contacts — but they don\'t write emails, auto-respond, or track opens and clicks.',
                solution: 'LoiBlast is a CRM, an email platform, an auto-responder, and an analytics suite in one dashboard.',
              },
              {
                title: 'Standalone Instagram Tools',
                problem: 'They manage social — but they\'re completely disconnected from your email outreach.',
                solution: 'LoiBlast unifies email and Instagram engagement in one inbox so no lead falls through the cracks.',
              },
            ].map((item, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-red-600 dark:text-red-400 font-bold text-sm">{i + 1}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                      <span className="font-medium text-gray-700 dark:text-gray-300">The gap:</span> {item.problem}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium text-blue-600 dark:text-blue-400">LoiBlast:</span> {item.solution}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4">What You Get</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, i) => {
              const Icon = value.icon;
              return (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{value.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{value.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap className="w-6 h-6 text-white" fill="white" />
            <h2 className="text-3xl font-bold text-white">Join the Outreach Revolution</h2>
          </div>
          <p className="text-lg text-blue-50 mb-8">
            Stop doing manual work that AI can handle. Start your free account today.
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
