import { AndroidAppSection } from './home/AndroidAppSection.jsx';
import { FeatureGrid } from './home/FeatureGrid.jsx';
import { FinalCta } from './home/FinalCta.jsx';
import { PageIntro } from './home/PageIntro.jsx';
import { ProblemSection } from './home/ProblemSection.jsx';
import { WorkflowsSection } from './home/WorkflowsSection.jsx';

// /features: how a studio works on FrameDesk, day to day.
export function FeaturesPage() {
  return (
    <main>
      <PageIntro
        eyebrow="Features"
        title="Everything a studio does, on one desk."
        body="Uploads that survive a dropped connection, client review pinned to the second, freelancer access per project, and the admin work around it."
      />
      <ProblemSection />
      <WorkflowsSection />
      <FeatureGrid />
      <AndroidAppSection />
      <FinalCta />
    </main>
  );
}
