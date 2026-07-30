import React, { useState } from 'react';
import { PublicLayout } from './PublicLayout';
import { Check, ArrowRight, ChevronDown, HelpCircle } from 'lucide-react';

interface PricingPageProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function PricingPage({ currentPage, onNavigate }: PricingPageProps) {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const plans = [
    {
      name: 'Starter',
      tagline: 'For solo agents getting started',
      monthly: 29,
      annual: 24,
      features: [
        'Email campaign automation',
        'Contact scraping (up to 500 contacts/mo)',
        '1 sender email address',
        'Basic analytics (opens, clicks, delivery)',
        'Template editor with variable fallbacks',
        'Email support',
      ],
      cta: 'Start Free',
      highlighted: false,
    },
    {
      name: 'Professional',
      tagline: 'For growing teams scaling outreach',
      monthly: 79,
      annual: 65,
      features: [
        'Everything in Starter, plus:',
        'AI two-step auto-responder',
        'Instagram engagement (comments, DMs, auto-rules)',
        'Contact scraping (up to 5,000 contacts/mo)',
        '5 sender email addresses',
        'Advanced analytics (reply tracking, trends, per-sender)',
        'Template Studio with DOCX/PDF export',
        'AI template generation',
        'Priority support',
      ],
      cta: 'Start Free',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      tagline: 'For brokerages and large teams',
      monthly: 199,
      annual: 165,
      features: [
        'Everything in Professional, plus:',
        'Unlimited contact scraping',
        'Unlimited sender email addresses',
        'Priority send queue & delivery',
        'Custom integrations',
        'Team accounts & permissions',
        'Dedicated account manager',
        '24/7 phone support',
      ],
      cta: 'Contact Sales',
      highlighted: false,
    },
  ];

  const comparisonFeatures = [
    { label: 'Email campaign automation', starter: true, pro: true, enterprise: true },
    { label: 'Contact scraping', starter: '500/mo', pro: '5,000/mo', enterprise: 'Unlimited' },
    { label: 'Sender email addresses', starter: '1', pro: '5', enterprise: 'Unlimited' },
    { label: 'AI two-step auto-responder', starter: false, pro: true, enterprise: true },
    { label: 'Instagram engagement', starter: false, pro: true, enterprise: true },
    { label: 'Basic analytics', starter: true, pro: true, enterprise: true },
    { label: 'Advanced analytics & trends', starter: false, pro: true, enterprise: true },
    { label: 'Template Studio (DOCX/PDF)', starter: false, pro: true, enterprise: true },
    { label: 'AI template generation', starter: false, pro: true, enterprise: true },
    { label: 'Priority send queue', starter: false, pro: false, enterprise: true },
    { label: 'Team accounts & permissions', starter: false, pro: false, enterprise: true },
    { label: 'Dedicated account manager', starter: false, pro: false, enterprise: true },
  ];

  const faqs = [
    { q: 'Is there a free trial?', a: 'Yes. Every plan starts free — no credit card required. You can explore the platform and build your first campaign before upgrading.' },
    { q: 'Can I upgrade or downgrade anytime?', a: 'Absolutely. You can change your plan at any time from your account settings. Changes take effect immediately and we prorate the difference.' },
    { q: 'What payment methods do you accept?', a: 'We accept all major credit cards. Enterprise plans can also pay by invoice with NET-30 terms.' },
    { q: 'Can I cancel my subscription?', a: 'Yes, you can cancel at any time. You will keep access until the end of your current billing period. See our Refund Policy for details.' },
    { q: 'Do you offer team discounts?', a: 'Yes. Enterprise plans include team accounts and volume pricing. Contact our sales team for a custom quote.' },
    { q: 'What happens if I exceed my contact limit?', a: 'You will be notified when you approach your limit. You can upgrade to a higher plan at any time, or wait until your monthly allowance resets.' },
  ];

  const renderCell = (val: boolean | string) => {
    if (val === true) return <Check className="w-5 h-5 text-green-500 mx-auto" />;
    if (val === false) return <span className="text-gray-300 dark:text-gray-600">&mdash;</span>;
    return <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{val}</span>;
  };

  return (
    <PublicLayout currentPage={currentPage} onNavigate={onNavigate}>
      <section className="bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Pricing That{' '}
            <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              Scales With You
            </span>
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-10">
            Start free. Upgrade when you are ready. Cancel anytime.
          </p>

          <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
                billing === 'monthly' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
                billing === 'annual' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Annual <span className="text-green-500 font-semibold">Save 20%</span>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 transition-all ${
                  plan.highlighted
                    ? 'bg-white dark:bg-gray-800 shadow-2xl border-2 border-blue-500 lg:-translate-y-4'
                    : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-lg'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full shadow-md">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{plan.tagline}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">
                    ${billing === 'annual' ? plan.annual : plan.monthly}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">/mo</span>
                </div>
                <button
                  onClick={() => onNavigate(plan.name === 'Enterprise' ? 'contact' : 'register')}
                  className={`w-full py-3 rounded-xl text-sm font-semibold transition-all mb-8 ${
                    plan.highlighted
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {plan.cta}
                </button>
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className={`text-sm ${i === 0 && feature === 'Everything in Starter, plus:' ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-10 text-center">
            Compare All Features
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full bg-white dark:bg-gray-800">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">Feature</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">Starter</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-blue-600 dark:text-blue-400">Professional</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <td className="text-left px-6 py-3.5 text-sm text-gray-700 dark:text-gray-300">{row.label}</td>
                    <td className="text-center px-6 py-3.5">{renderCell(row.starter)}</td>
                    <td className="text-center px-6 py-3.5 bg-blue-50/50 dark:bg-blue-900/10">{renderCell(row.pro)}</td>
                    <td className="text-center px-6 py-3.5">{renderCell(row.enterprise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-2 mb-3">
              <HelpCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Frequently Asked Questions</h2>
            </div>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Still Have Questions?</h2>
          <p className="text-lg text-blue-50 mb-8">
            Talk to our team or just dive in — it's free to start.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('register')}
              className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-blue-600 bg-white hover:bg-blue-50 rounded-xl shadow-lg transition-all hover:-translate-y-0.5"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => onNavigate('contact')}
              className="px-8 py-3.5 text-base font-semibold text-white border-2 border-white/40 hover:border-white rounded-xl transition-all"
            >
              Contact Sales
            </button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
