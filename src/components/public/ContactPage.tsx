import React, { useState } from 'react';
import { PublicLayout } from './PublicLayout';
import { Mail, MessageSquare, Clock, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PublicRoute } from '../../lib/router';

interface ContactPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function ContactPage({ currentRoute, onNavigate }: ContactPageProps) {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const { error } = await supabase
        .from('contact_messages')
        .insert({ name: formData.name, email: formData.email, message: formData.message });
      if (error) throw error;
      setStatus('success');
      setFormData({ name: '', email: '', message: '' });
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <section className="pt-20 pb-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Contact
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-om-forest-deep mb-6">
            Let's Talk
          </h1>
          <p
            className="text-xl md:text-2xl text-om-mahogany max-w-2xl mx-auto"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            Have a question about getting started? We'll get back to you within one business day.
          </p>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="bg-om-cream border border-om-tan rounded-xl p-8">
              {status === 'success' ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-om-forest/10 border border-om-forest/30 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-8 h-8 text-om-forest" />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-om-forest-deep mb-3">Message Sent!</h2>
                  <p className="text-om-brown mb-8" style={{ fontFamily: "'EB Garamond', serif" }}>
                    Thanks for reaching out. We'll get back to you within one business day.
                  </p>
                  <button
                    onClick={() => setStatus('idle')}
                    className="text-sm font-medium text-om-gold hover:text-om-gold-dark transition-colors"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-om-forest-deep mb-1.5 font-display">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-om-tan rounded bg-om-cream text-om-forest-deep placeholder-om-brown/50 focus:ring-1 focus:ring-om-gold focus:border-om-gold outline-none transition-colors"
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-om-forest-deep mb-1.5 font-display">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-om-tan rounded bg-om-cream text-om-forest-deep placeholder-om-brown/50 focus:ring-1 focus:ring-om-gold focus:border-om-gold outline-none transition-colors"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-om-forest-deep mb-1.5 font-display">Message</label>
                    <textarea
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-om-tan rounded bg-om-cream text-om-forest-deep placeholder-om-brown/50 focus:ring-1 focus:ring-om-gold focus:border-om-gold outline-none transition-colors resize-none"
                      placeholder="How can we help?"
                      required
                    />
                  </div>

                  {status === 'error' && (
                    <div className="flex items-center gap-2 p-4 text-sm text-om-mahogany bg-om-gold/10 border border-om-gold/40 rounded-lg">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 text-om-gold-dark" />
                      <p>{errorMessage}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full py-3 px-6 rounded text-sm font-medium flex items-center justify-center gap-2 transition-all bg-om-forest hover:bg-om-forest-dark text-om-cream disabled:bg-om-forest/60 disabled:cursor-wait"
                  >
                    {status === 'loading' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-om-cream border-t-transparent rounded-full animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        Send Message
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-6">
            <div className="bg-om-cream border border-om-tan rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-om-forest flex items-center justify-center">
                  <Mail className="w-5 h-5 text-om-cream" />
                </div>
                <h3 className="text-base font-display font-semibold text-om-forest-deep">Email Us</h3>
              </div>
              <p className="text-sm text-om-brown mb-2" style={{ fontFamily: "'EB Garamond', serif" }}>
                For general inquiries and support questions.
              </p>
              <a
                href="mailto:support@loiblast.com"
                onClick={(e) => e.preventDefault()}
                className="text-sm font-medium text-om-gold hover:text-om-gold-dark transition-colors"
              >
                support@loiblast.com
              </a>
            </div>

            <div className="bg-om-cream border border-om-tan rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-om-forest flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-om-cream" />
                </div>
                <h3 className="text-base font-display font-semibold text-om-forest-deep">Book a Demo</h3>
              </div>
              <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                Want a guided walkthrough? Schedule a personalized demo with our team.
              </p>
              <button
                onClick={() => onNavigate('contact')}
                className="text-sm font-medium text-om-gold hover:text-om-gold-dark transition-colors"
              >
                Contact us &rarr;
              </button>
            </div>

            <div className="bg-om-cream border border-om-tan rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-om-forest flex items-center justify-center">
                  <Clock className="w-5 h-5 text-om-cream" />
                </div>
                <h3 className="text-base font-display font-semibold text-om-forest-deep">Response Time</h3>
              </div>
              <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                We respond to all inquiries within one business day. Most messages are answered much faster.
              </p>
            </div>

            <div className="bg-om-gold/10 border border-om-gold/40 rounded-xl p-6">
              <h3 className="text-base font-display font-semibold text-om-forest-deep mb-2">
                Account Creation
              </h3>
              <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                New accounts are created by invitation only. Contact us to get set up — we'll create your organization and send you an invitation with your login details.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
