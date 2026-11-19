import { FaqSection } from './home/FaqSection.jsx';
import { FinalCta } from './home/FinalCta.jsx';
import { PricingPreview } from './home/PricingPreview.jsx';

// /pricing: the plans and the questions people ask before paying.
export function PricingPage() {
  return (
    <main>
      <PricingPreview />
      <FaqSection />
      <FinalCta />
    </main>
  );
}
