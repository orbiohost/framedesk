import { AiSection } from './home/AiSection.jsx';
import { ConnectorsShowcase } from './home/ConnectorsShowcase.jsx';
import { FinalCta } from './home/FinalCta.jsx';
import { PageIntro } from './home/PageIntro.jsx';

// /ai: the built-in assistant and the connectors for outside AI apps.
export function AiFeaturesPage() {
  return (
    <main>
      <PageIntro
        eyebrow="AI assistant"
        title="An assistant that has seen your footage."
        body="It transcribes recordings in Hindi and English, watches your clips, reads your briefs and answers about your real projects. Or connect Claude, ChatGPT or Gemini to your workspace."
      />
      <AiSection />
      <ConnectorsShowcase />
      <FinalCta />
    </main>
  );
}
