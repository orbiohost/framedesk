import { Download, Mic, ShieldCheck, Smartphone, Zap } from 'lucide-react';
import { Eyebrow, Reveal } from './Reveal.jsx';

// The APK is built from android/ and served from client/public/downloads/.
const APK_URL = '/downloads/framedesk.apk';
const APK_SIZE = '1 MB';

const POINTS = [
  { icon: Zap, text: 'Opens straight into your workspace, full screen, no browser bar.' },
  { icon: Mic, text: 'Dictate notes, upload from your camera roll, review cuts on set.' },
  { icon: ShieldCheck, text: 'Always up to date: new features arrive without reinstalling.' },
];

const STEPS = [
  'Tap “Download for Android” on your phone.',
  'Open the downloaded file. If asked, allow installs from your browser.',
  'Tap Install, then sign in as usual.',
];

export function AndroidAppSection() {
  return (
    <section id="android" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <Eyebrow>Android app</Eyebrow>
          <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
            The whole desk, in your pocket.
          </h2>
          <p className="text-muted mt-5 max-w-xl text-lg leading-relaxed">
            Install FrameDesk on your Android phone or tablet and keep projects, tasks and client
            review a tap away.
          </p>
          <ul className="mt-7 space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3">
                <span className="bg-mint text-ink grid h-8 w-8 shrink-0 place-items-center rounded-xl">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="pt-1 text-sm leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href={APK_URL}
              download="FrameDesk.apk"
              className="bg-ink text-bg inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download for Android
            </a>
            <span className="text-muted text-sm">Android 7.0 or newer · {APK_SIZE}</span>
          </div>
        </Reveal>

        <Reveal delay={120} className="border-line/70 bg-surface rounded-[32px] border p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <img
              src="/icons/icon-192.png"
              alt=""
              width="56"
              height="56"
              loading="lazy"
              className="h-14 w-14 rounded-2xl"
            />
            <div>
              <p className="font-medium">FrameDesk for Android</p>
              <p className="text-muted flex items-center gap-1.5 text-sm">
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                Phones and tablets
              </p>
            </div>
          </div>
          <h3 className="mt-8 font-medium">How to install</h3>
          <ol className="mt-4 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="bg-lavender text-ink grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="text-muted pt-0.5 text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-muted border-line/70 mt-6 border-t pt-5 text-xs leading-relaxed">
            On a computer? Open this page on your phone, or send yourself the link.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
