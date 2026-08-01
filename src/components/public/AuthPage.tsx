import React, { useState } from 'react';
import { PublicLayout } from './PublicLayout';
import { LogIn, UserPlus, Eye, EyeOff, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PublicRoute } from '../../lib/router';

interface AuthPageProps {
  mode: 'login' | 'register';
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export function AuthPage({ mode, currentRoute, onNavigate }: AuthPageProps) {
  const isLogin = mode === 'login';
  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    if (!isLogin && formData.password !== formData.confirmPassword) {
      setStatus('error');
      setErrorMessage('Passwords do not match');
      return;
    }

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) {
          if (error.message === 'Invalid login credentials') {
            throw new Error('The email or password you entered is incorrect. Please try again.');
          }
          if (error.message.includes('Email not confirmed')) {
            throw new Error('Please check your email to confirm your account before logging in.');
          }
          throw error;
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
      }
      setStatus('success');
      setFormData({ email: '', password: '', confirmPassword: '' });
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  };

  const benefits = [
    'AI-powered email automation',
    'Save 15+ hours every week',
    'Never miss a follow-up',
    'Bank-level security',
  ];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <section className="py-16 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left side */}
          <div className="hidden lg:block">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-om-forest-deep mb-4">
              {isLogin ? 'Welcome Back.' : 'Start Automating Today.'}
            </h1>
            <p
              className="text-lg text-om-mahogany mb-8 leading-relaxed"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              {isLogin
                ? 'Sign in to access your dashboard, campaigns, and AI auto-responder. Your inbox is waiting.'
                : 'Create your free account and see the difference AI-powered automation makes. No credit card required.'}
            </p>
            <ul className="space-y-3">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-om-gold flex-shrink-0" />
                  <span className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right side - form */}
          <div className="bg-om-parchment border border-om-tan rounded-xl p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-om-forest flex items-center justify-center">
                {isLogin ? <LogIn className="w-5 h-5 text-om-cream" /> : <UserPlus className="w-5 h-5 text-om-cream" />}
              </div>
              <div>
                <h2 className="text-xl font-display font-semibold text-om-forest-deep">
                  {isLogin ? 'Sign In' : 'Create Account'}
                </h2>
                <p className="text-sm text-om-brown" style={{ fontFamily: "'EB Garamond', serif" }}>
                  {isLogin ? 'Enter your credentials below' : 'Get started in under a minute'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {status === 'error' && (
                <div className="flex items-center gap-2 p-4 text-sm text-om-mahogany bg-om-gold/10 border border-om-gold/40 rounded-lg">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-om-gold-dark" />
                  <p>{errorMessage}</p>
                </div>
              )}

              {status === 'success' && !isLogin && (
                <div className="flex items-center gap-2 p-4 text-sm text-om-forest bg-om-forest/10 border border-om-forest/30 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <p>Account created! Check your email to confirm, then sign in.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-om-forest-deep mb-1.5 font-display">
                  Email Address
                </label>
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
                <label className="block text-sm font-medium text-om-forest-deep mb-1.5 font-display">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-om-tan rounded bg-om-cream text-om-forest-deep placeholder-om-brown/50 focus:ring-1 focus:ring-om-gold focus:border-om-gold outline-none transition-colors pr-11"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-om-brown hover:text-om-mahogany"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-om-forest-deep mb-1.5 font-display">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-om-tan rounded bg-om-cream text-om-forest-deep placeholder-om-brown/50 focus:ring-1 focus:ring-om-gold focus:border-om-gold outline-none transition-colors pr-11"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-om-brown hover:text-om-mahogany"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || status === 'success'}
                className={`w-full py-3 px-6 rounded text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                  status === 'loading'
                    ? 'bg-om-forest/60 cursor-wait text-om-cream'
                    : status === 'success'
                    ? 'bg-om-forest-dark cursor-default text-om-cream'
                    : 'bg-om-forest hover:bg-om-forest-dark text-om-cream'
                }`}
              >
                {status === 'loading' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-om-cream border-t-transparent rounded-full animate-spin" />
                    {isLogin ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : status === 'success' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {isLogin ? 'Welcome Back!' : 'Account Created!'}
                  </>
                ) : (
                  <>
                    {isLogin ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => onNavigate(isLogin ? 'register' : 'login')}
                className="text-sm text-om-gold hover:text-om-gold-dark font-medium transition-colors"
              >
                {isLogin ? "Don't have an account? Sign up free" : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
