import React, { useState } from 'react';
import { PublicLayout } from './PublicLayout';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

interface QuizPageProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

interface QuizQuestion {
  question: string;
  options: { text: string; identity: string }[];
}

const quizQuestions: QuizQuestion[] = [
  {
    question: 'Be honest. Why are you really here?',
    options: [
      { text: "I'm drowning in emails and need a lifeline.", identity: "someone who's ready to be rescued" },
      { text: 'I want my evenings back.', identity: 'someone who values their time' },
    ],
  },
  {
    question: 'If your emails answered themselves, what would you do with the hours back?',
    options: [
      { text: 'Close more deals. Obviously.', identity: 'someone driven by revenue' },
      { text: 'Be present with my family again.', identity: 'someone who remembers what matters' },
    ],
  },
];

export function QuizPage({ currentRoute, onNavigate }: QuizPageProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);

  const handleAnswer = (identity: string) => {
    const newAnswers = [...answers, identity];
    setAnswers(newAnswers);
    if (currentStep + 1 < quizQuestions.length) {
      setCurrentStep(currentStep + 1);
    } else {
      setCompleted(true);
    }
  };

  const handleRestart = () => {
    setCurrentStep(0);
    setAnswers([]);
    setCompleted(false);
  };

  if (completed) {
    return (
      <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
        <div className="min-h-[70vh] bg-om-cream flex flex-col items-center justify-center px-4 py-20">
          <div className="max-w-2xl text-center">
            <p className="text-om-gold text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              Your Result
            </p>
            <h1 className="text-4xl md:text-6xl font-display font-bold text-om-forest-deep leading-tight mb-6">
              Cook the Competition
            </h1>
            <p
              className="text-base md:text-xl text-om-mahogany max-w-xl mx-auto leading-relaxed mb-10"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              You are {answers.join(', ')}. LoiBlast makes sure your leads don't go to your competition. Or we'll help your competition. Choose wisely.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => onNavigate('contact')}
                className="px-8 py-3.5 bg-om-forest text-om-cream hover:bg-om-forest-dark font-medium transition-colors rounded inline-flex items-center justify-center gap-2"
              >
                Get In Touch
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleRestart}
                className="inline-flex items-center gap-2 px-6 py-3.5 text-sm text-om-brown hover:text-om-mahogany transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Take the quiz again
              </button>
            </div>
            <button
              onClick={() => onNavigate('home')}
              className="mt-8 inline-flex items-center gap-2 text-sm text-om-brown hover:text-om-mahogany transition-colors"
            >
              Back to home
            </button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const question = quizQuestions[currentStep];

  return (
    <PublicLayout currentRoute={currentRoute} onNavigate={onNavigate}>
      <div className="min-h-[80vh] bg-om-cream flex flex-col items-center justify-center px-4 py-20">
        <div className="max-w-2xl w-full">
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-8">
            {quizQuestions.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= currentStep ? 'bg-om-forest' : 'bg-om-tan/40'
                }`}
              />
            ))}
          </div>

          <p className="text-om-gold text-sm tracking-widest uppercase mb-3 text-center">
            Quiz · Step {currentStep + 1} of {quizQuestions.length}
          </p>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-om-forest-deep mb-6 leading-tight text-center">
            {question.question}
          </h1>

          <div className="space-y-3">
            {question.options.map((option) => (
              <button
                key={option.text}
                onClick={() => handleAnswer(option.identity)}
                className="w-full text-left px-5 py-4 bg-om-parchment border border-om-tan rounded-lg text-om-forest-deep hover:border-om-gold hover:bg-om-gold/5 transition-all group flex items-center justify-between"
              >
                <span className="text-base md:text-lg" style={{ fontFamily: "'EB Garamond', serif" }}>
                  {option.text}
                </span>
                <ArrowRight className="w-5 h-5 text-om-tan group-hover:text-om-gold transition-colors flex-shrink-0 ml-4" />
              </button>
            ))}
          </div>

          {currentStep > 0 && (
            <button
              onClick={() => {
                setAnswers(answers.slice(0, -1));
                setCurrentStep(currentStep - 1);
              }}
              className="mt-8 text-sm text-om-brown hover:text-om-mahogany transition-colors mx-auto block"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
