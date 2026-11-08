import { useState } from 'react';
import {
  Instagram, Linkedin, AtSign, CalendarClock, Sparkles, Mic, Tags, Link2,
  BarChart3, Repeat, CornerDownRight, Scissors, Heart, MessageCircle, CheckCircle2, ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import type { PublicRoute } from '../../lib/router';

const serif = { fontFamily: "'EB Garamond', serif" };

interface Platform {
  id: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  highlights: string[];
  more: string[];
}

const PLATFORMS: Platform[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: Instagram,
    tagline: 'Auto-post, auto-reply, and never miss a DM.',
    highlights: [
      'AI writes captions and picks photos from your media library',
      'Carousel posts with text overlays sized to fit each slide',
      'Comment and DM autoresponder with multi-step conversation flows',
    ],
    more: [
      'Weekly prompt plans fill your calendar automatically',
      'Saved links added to captions when you want them',
      'Post insights and account stats refreshed automatically',
      'Share settings and flows across team accounts',
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin,
    tagline: 'A consistent professional presence on autopilot.',
    highlights: [
      'AI drafts posts in your own voice from your writing samples',
      'Text, image, video, and document posts scheduled to the minute',
      'Analytics snapshots show which posts actually perform',
    ],
    more: [
      'Compose tab for quick one-off posts',
      'Prompt plans with a different prompt for every weekday slot',
      'Topic rotation so your feed never repeats itself',
      'Drag-and-drop calendar and timeline view',
    ],
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: AtSign,
    tagline: 'Multi-post threads that keep people reading.',
    highlights: [
      'Write a hook, then chain up to 10 follow-up replies automatically',
      'Auto mode lets AI decide how many replies your content needs',
      'One-click split turns long text into a flowing thread',
    ],
    more: [
      'Dedicated Threads prompt category, editable per post',
      'Post to multiple Threads profiles at once',
      'Optional cross-post to Instagram when photos are attached',
      'Views, likes, replies, and reposts tracked per post',
    ],
  },
];

const SHARED_TOOLS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Repeat, title: 'Prompt Plans', body: 'Set a weekly rhythm once. Each slot has its own prompt, topic, voice, link, and photo rules, and fresh posts are written every week.' },
  { icon: Mic, title: 'Voice Library', body: 'Save samples of your writing so AI matches your tone instead of sounding like a robot.' },
  { icon: Tags, title: 'Topic Rotation', body: 'Keep a list of topics and let each post rotate through them, or lock a slot to one subject.' },
  { icon: CalendarClock, title: 'Content Calendar', body: 'See every scheduled post across the month, drag to reschedule, and open any day to edit.' },
  { icon: Link2, title: 'Saved Links', body: 'Store your booking page, portfolio, or lead magnet once and attach it to any post in a click.' },
  { icon: BarChart3, title: 'Post Insights', body: 'Engagement for every published post, refreshed automatically so you know what to post more of.' },
];

const THREAD_DEMO = [
  { text: 'Most people lose a prospect\'s attention in the first 5 minutes of a conversation. Not because of price.', note: 'The hook' },
  { text: 'They lose them because they talk about themselves. Prospects want to hear about their own needs:\n\u2022 What makes their situation unique\n\u2022 Who else is in their space', note: 'Follow-up 1' },
  { text: '\u2022 How long similar opportunities take\n\u2022 What you would address first\n\nSpecifics build trust faster than a résumé.', note: 'Follow-up 2' },
  { text: 'Next conversation, ask 3 questions before you mention yourself once. What is your go-to opener?', note: 'The wrap-up' },
];

function ThreadMock() {
  return (
    <div className="bg-om-cream border border-om-tan rounded-2xl p-5 sm:p-6 shadow-lg">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-om-forest flex items-center justify-center text-om-cream font-display font-semibold">L</div>
        <div>
          <p className="text-sm font-semibold text-om-forest-deep">yourbrand</p>
          <p className="text-xs text-om-brown">Scheduled for 9:00 AM</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-om-parchment px-2.5 py-1 text-xs font-medium text-om-forest">
          <Sparkles className="w-3.5 h-3.5 text-om-gold-dark" /> AI thread
        </span>
      </div>
      <ol className="relative">
        {THREAD_DEMO.map((part, i) => (
          <li
            key={part.note}
            className="relative pl-8 pb-5 last:pb-0"
            style={{ animation: 'fadeInUp 0.6s ease-out both', animationDelay: `${i * 180}ms` }}
          >
            {i < THREAD_DEMO.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-om-tan" aria-hidden />}
            <span className={`absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center ${i === 0 ? 'bg-om-gold text-om-forest-deep' : 'bg-om-parchment border border-om-tan text-om-forest'}`}>
              {i === 0 ? <AtSign className="w-3.5 h-3.5" /> : <CornerDownRight className="w-3.5 h-3.5" />}
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-om-gold-dark mb-1">{part.note}</p>
            <p className="whitespace-pre-line text-sm text-om-forest-deep leading-relaxed">{part.text}</p>
            {i === 0 && (
              <div className="mt-2 flex items-center gap-4 text-xs text-om-brown">
                <span className="inline-flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> 214</span>
                <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> 38</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlatformCard({ platform, detailed }: { platform: Platform; detailed: boolean }) {
  const Icon = platform.icon;
  const items = detailed ? [...platform.highlights, ...platform.more] : platform.highlights;
  return (
    <div className="group bg-om-cream border border-om-tan rounded-xl p-6 lg:p-8 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg bg-om-forest flex items-center justify-center group-hover:bg-om-forest-dark transition-colors">
          <Icon className="w-6 h-6 text-om-gold" />
        </div>
        <div>
          <h3 className="text-xl font-display font-semibold text-om-forest-deep">{platform.name}</h3>
          {platform.id === 'threads' && <span className="text-[11px] font-bold uppercase tracking-widest text-om-gold-dark">New</span>}
        </div>
      </div>
      <p className="text-base text-om-mahogany mb-4" style={serif}>{platform.tagline}</p>
      <ul className="space-y-2.5">
        {items.map((h) => (
          <li key={h} className="flex items-start gap-2 text-sm text-om-brown leading-relaxed" style={serif}>
            <CheckCircle2 className="w-4 h-4 text-om-forest flex-shrink-0 mt-0.5" /> {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SectionProps {
  detailed?: boolean;
  onNavigate: (route: PublicRoute) => void;
}

export function SocialStudioSection({ detailed = false, onNavigate }: SectionProps) {
  const [tool, setTool] = useState(0);
  const active = SHARED_TOOLS[tool];
  const ActiveIcon = active.icon;

  return (
    <>
      <section className="py-14 px-4 sm:px-6 bg-om-parchment">
        <div className="max-w-7xl mx-auto w-full min-w-0">
          <div className="text-center mb-12">
            <p className="text-om-gold-dark text-sm md:text-base font-medium tracking-widest uppercase mb-4">New: Social Content Studio</p>
            <h2 className="text-3xl md:text-5xl font-display font-semibold text-om-forest-deep mb-6">Your Social Feeds, Written and Posted for You</h2>
            <p className="text-xl text-om-mahogany max-w-3xl mx-auto" style={serif}>
              Plan a week of content once. AI writes every post in your voice, attaches your photos and links, and publishes on schedule to Instagram, LinkedIn, and Threads.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PLATFORMS.map((p) => <PlatformCard key={p.id} platform={p} detailed={detailed} />)}
          </div>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-om-cream">
        <div className="max-w-6xl mx-auto w-full min-w-0 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-om-gold-dark text-sm md:text-base font-medium tracking-widest uppercase mb-4">Threads that keep people reading</p>
            <h2 className="text-3xl md:text-4xl font-display font-semibold text-om-forest-deep mb-6 leading-tight">One idea. A whole thread. Zero copy-pasting.</h2>
            <p className="text-lg text-om-mahogany mb-8 leading-relaxed" style={serif}>
              The main post hooks the reader, each reply picks up exactly where the last one stopped, and the final reply lands the takeaway. LoiBlast posts them in order, each replying to the one before it.
            </p>
            <div className="space-y-4">
              {[
                { icon: Sparkles, title: 'Auto reply count', body: 'Pick a number, or let AI use as many replies as the content needs, up to 10.' },
                { icon: Scissors, title: 'Smart split', body: 'Paste a long draft and split it at natural breaks. Bullets and sentences are never cut in half.' },
                { icon: Repeat, title: 'Works in your weekly plan', body: 'Turn any plan slot into a thread and new ones are written every week.' },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-om-parchment border border-om-tan/40 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-om-forest" />
                  </div>
                  <div>
                    <h3 className="text-base font-display font-semibold text-om-forest-deep">{title}</h3>
                    <p className="text-sm text-om-brown leading-relaxed" style={serif}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ThreadMock />
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-om-forest-deep">
        <div className="max-w-6xl mx-auto w-full min-w-0">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-display font-semibold text-om-parchment mb-4">One Toolkit for Every Platform</h2>
            <p className="text-lg text-om-tan" style={serif}>The same planning tools power Instagram, LinkedIn, and Threads.</p>
          </div>
          <div className="grid lg:grid-cols-5 gap-6 items-stretch">
            <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-2" role="tablist">
              {SHARED_TOOLS.map((t, i) => {
                const Icon = t.icon;
                const selected = i === tool;
                return (
                  <button
                    key={t.title}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTool(i)}
                    onMouseEnter={() => setTool(i)}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${selected ? 'bg-om-gold text-om-forest-deep' : 'text-om-tan hover:bg-om-forest-dark hover:text-om-parchment'}`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-semibold">{t.title}</span>
                  </button>
                );
              })}
            </div>
            <div key={active.title} className="lg:col-span-3 border border-om-forest rounded-xl p-8 flex flex-col justify-center animate-fade-in-up">
              <ActiveIcon className="w-10 h-10 text-om-gold mb-5" />
              <h3 className="text-2xl font-display font-semibold text-om-parchment mb-3">{active.title}</h3>
              <p className="text-lg text-om-tan leading-relaxed" style={serif}>{active.body}</p>
            </div>
          </div>
          {!detailed && (
            <div className="text-center mt-10">
              <button
                onClick={() => onNavigate('features')}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-om-gold text-om-forest-deep hover:bg-om-gold-dark hover:text-om-cream font-bold transition-colors rounded"
              >
                See Everything It Can Do <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
