import { AiSection } from './home/AiSection.jsx';
import { AndroidAppSection } from './home/AndroidAppSection.jsx';
import { ConnectorsShowcase } from './home/ConnectorsShowcase.jsx';
import { FaqSection } from './home/FaqSection.jsx';
import { FeatureGrid } from './home/FeatureGrid.jsx';
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
      <AiSection />
      <ConnectorsShowcase />
      <WorkflowsSection />
      <FeatureGrid />
      <PricingPreview />
      <AndroidAppSection />
      <FaqSection />
      <FinalCta />
    </main>
  );
}
