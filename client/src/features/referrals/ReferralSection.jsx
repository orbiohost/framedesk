import { Check, Copy, Gift, HardDrive, Share2, TicketPercent, UserPlus } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { SettingsRow, SettingsSection } from '../account/SettingsSection.jsx';
import { useCopy, useMyReferrals } from './referrals.js';

function Step({ icon: Icon, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="bg-lavender text-accent dark:text-ink grid h-9 w-9 shrink-0 place-items-center rounded-xl">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted block text-[13px] leading-5">{children}</span>
      </span>
    </li>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-subtle/60 rounded-2xl px-4 py-3">
      <p className="text-muted text-xs">{label}</p>
      <p className="font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}

// Profile → Refer & earn: your link, what it gives, and how it's going.
export function ReferralSection() {
  const { data, isPending, isError, error } = useMyReferrals();
  const copy = useCopy();

  if (isPending) return <Skeleton className="h-72 w-full rounded-3xl" />;
  if (isError) return <Alert tone="error">{error.message}</Alert>;
  if (!data.enabled) {
    return (
      <SettingsSection title="Refer & earn">
        <p className="text-muted py-5 text-sm">Referrals are paused right now. Check back soon.</p>
      </SettingsSection>
    );
  }

  const reward = `${data.rewardGB} GB`;
  const share = () =>
    navigator
      .share?.({
        title: 'FrameDesk',
        text: `Manage your projects, files and clients on FrameDesk. Sign up with my link and get ${data.discountPercent}% off your first plan.`,
        url: data.link,
      })
      .catch(() => {});

  return (
    <SettingsSection
      title="Refer & earn"
      description={`Invite another studio. They get ${data.discountPercent}% off their first plan; you get ${reward} of extra storage.`}
    >
      <SettingsRow label="Your link" description="Anyone who signs up with it counts as yours.">
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              readOnly
              value={data.link}
              onFocus={(event) => event.target.select()}
              aria-label="Your referral link"
              className="border-line bg-subtle/50 h-10 min-w-0 flex-1 rounded-full border px-4 text-sm"
            />
            <Button
              variant="secondary"
              onClick={() => copy.mutate(data.link)}
              aria-label="Copy your referral link"
            >
              {copy.isSuccess ? (
                <Check className="text-success h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{copy.isSuccess ? 'Copied' : 'Copy'}</span>
            </Button>
            {typeof navigator.share === 'function' && (
              <Button variant="secondary" onClick={share} aria-label="Share your referral link">
                <Share2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <p className="text-muted text-xs">
            Your code: <span className="text-ink font-mono font-semibold">{data.code}</span>
          </p>
        </div>
      </SettingsRow>

      <SettingsRow label="How it works">
        <ol className="space-y-3">
          <Step icon={UserPlus} title="A friend signs up with your link">
            Email or Google sign-up, within a week of clicking it.
          </Step>
          <Step icon={HardDrive} title={`You get ${reward} of extra storage`}>
            {data.rewardLimit === 1
              ? 'Once they verify their email. One reward per account.'
              : `Once they verify their email, for up to ${data.rewardLimit} friends.`}{' '}
            It stays on your account, on any plan, free included.
          </Step>
          <Step icon={TicketPercent} title={`They get ${data.discountPercent}% off`}>
            Taken off their first paid plan automatically at checkout.
          </Step>
        </ol>
      </SettingsRow>

      <SettingsRow label="So far">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Signed up" value={data.invited} />
          <Stat label="Verified" value={data.joined} />
          <Stat label="Storage earned" value={`${data.earnedGB} GB`} />
        </div>
        {data.rewardsLeft === 0 && (
          <p className="text-muted mt-3 flex items-center gap-1.5 text-xs">
            <Gift className="text-accent h-3.5 w-3.5" aria-hidden="true" />
            You have earned all the storage on offer. Friends still get their discount.
          </p>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}
