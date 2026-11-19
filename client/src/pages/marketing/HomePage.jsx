import { ExploreLinks } from './home/ExploreLinks.jsx';
import { FinalCta } from './home/FinalCta.jsx';
import { HeroSection } from './home/HeroSection.jsx';
import { PricingPreview } from './home/PricingPreview.jsx';
import { StudioToolsSection } from './home/StudioToolsSection.jsx';

// Kept short: what FrameDesk is, what it does, what it costs. The detail
// lives on /features, /ai and /pricing.
export function HomePage() {
  return (
    <main>
      <HeroSection />
      <StudioToolsSection />
      <ExploreLinks />
      <PricingPreview />
      <FinalCta />
    </main>
  );
}
