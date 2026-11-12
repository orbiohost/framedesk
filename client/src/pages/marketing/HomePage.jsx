import { FaqSection } from './home/FaqSection.jsx';
import { FinalCta } from './home/FinalCta.jsx';
import { HeroSection } from './home/HeroSection.jsx';
import { PricingPreview } from './home/PricingPreview.jsx';
import { ProblemSection } from './home/ProblemSection.jsx';
import { WorkflowsSection } from './home/WorkflowsSection.jsx';

export function HomePage() {
  return (
    <main>
      <HeroSection />
      <ProblemSection />
      <WorkflowsSection />
      <PricingPreview />
      <FaqSection />
      <FinalCta />
    </main>
  );
}
