import { useState } from 'react';
import { TextField } from '../../components/ui/TextField.jsx';
import { cn } from '../../lib/cn.js';
import { formatInr } from '../../lib/format.js';

// Admin → Plans: what each plan earns per account per month after what it
// costs to run (S3 storage, S3 downloads, AI, the payment fee), for the prices
// being edited, before they are saved. Cost prices come from Admin → Expenses
// and AI limits from Admin → AI; the usage guesses are the admin's to tune.

const WEEKS_PER_MONTH = 4.345;
// Razorpay: 2% per payment, plus 18% GST on that fee.
const DEFAULT_FEE_PERCENT = 2.36;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Rounds up to a price that ends in 9 (₹187 -> ₹189, ₹191 -> ₹199).
function friendlyPrice(amount) {
  return Math.max(9, Math.ceil((amount + 1) / 10) * 10 - 1);
}

function costPerMonth(plan, code, model, guess) {
  const usd = model.usdToInr;
  const storedGB = num(plan.storageGB) * (guess.storageUsed / 100);
  const storage = storedGB * model.s3PricePerGbMonthUsd * usd;
  const downloads = storedGB * guess.downloads * model.egressPricePerGbUsd * usd;
  const tokens =
    (model.weeklyCredits[code] ?? 0) *
    (guess.aiUsed / 100) *
    model.tokensPerCredit *
    WEEKS_PER_MONTH;
  const ai = guess.countAi ? (tokens / 1e6) * model.aiPricePerMillionTokensUsd * usd : 0;
  return { storage, downloads, ai, total: storage + downloads + ai };
}

// Pre-GST price per month for each way a plan can be bought.
function scenarios(plan, offer, cap) {
  const monthly = num(plan.monthlyPrice);
  const full = monthly * 12;
  const yearly = num(plan.yearlyPrice) || monthly * 10;
  const floor = Math.max(1, Math.ceil(full * (1 - cap / 100)));
  const rows = [
    { key: 'monthly', label: 'Monthly', perMonth: monthly },
    { key: 'yearly', label: 'Yearly', perMonth: yearly / 12 },
  ];
  if (offer.enabled && num(offer.percentOff) > 0) {
    const raw = Math.floor((full * (1 - num(offer.percentOff) / 100)) / 10) * 10;
    const price = Math.min(Math.max(raw, floor), yearly);
    rows.push({ key: 'offer', label: `Yearly, ${offer.percentOff}% offer`, perMonth: price / 12 });
  }
  rows.push({
    key: 'floor',
    label: `Lowest possible (${cap}% off)`,
    perMonth: floor / 12,
    hint: 'Offer + coupon or referral at the cap',
  });
  return rows;
}

function Money({ value, className }) {
  return <span className={cn('tabular-nums', className)}>{formatInr(Math.round(value))}</span>;
}

export function PlanProfitCalculator({ plans, offer, maxDiscountPercent, model }) {
  const [guess, setGuess] = useState({
    storageUsed: 50,
    downloads: 0.5,
    aiUsed: 30,
    feePercent: DEFAULT_FEE_PERCENT,
    targetMargin: 60,
    countAi: !model.aiFreeTier,
  });
  const set = (field) => (event) =>
    setGuess((current) => ({ ...current, [field]: num(event.target.value) }));
  const cap = num(maxDiscountPercent);
  const fee = guess.feePercent / 100;
  const margin = Math.min(95, guess.targetMargin) / 100;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <TextField
          id="calc-storage"
          label="Storage used (%)"
          type="number"
          min="0"
          max="100"
          hint="Of the plan's space"
          value={guess.storageUsed}
          onChange={set('storageUsed')}
        />
        <TextField
          id="calc-downloads"
          label="Downloads / month (×)"
          type="number"
          min="0"
          step="0.1"
          hint="× the data stored"
          value={guess.downloads}
          onChange={set('downloads')}
        />
        <TextField
          id="calc-ai"
          label="AI used (%)"
          type="number"
          min="0"
          max="100"
          hint="Of the weekly limit"
          value={guess.aiUsed}
          onChange={set('aiUsed')}
        />
        <TextField
          id="calc-fee"
          label="Payment fee (%)"
          type="number"
          min="0"
          step="0.01"
          hint="Razorpay 2% + GST"
          value={guess.feePercent}
          onChange={set('feePercent')}
        />
        <TextField
          id="calc-margin"
          label="Target margin (%)"
          type="number"
          min="0"
          max="95"
          hint="For the suggested price"
          value={guess.targetMargin}
          onChange={set('targetMargin')}
        />
      </div>
      <label className="text-muted flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={guess.countAi}
          onChange={(event) => setGuess((c) => ({ ...c, countAi: event.target.checked }))}
        />
        Count AI cost
        {model.aiFreeTier && ' (Gemini is on the free tier now, so it costs nothing yet)'}
      </label>

      <div className="space-y-4">
        {Object.entries(plans).map(([code, plan]) => {
          const cost = costPerMonth(plan, code, model, guess);
          const suggested = friendlyPrice(cost.total / ((1 - margin) * (1 - fee)));
          // Monthly price whose capped lowest price still covers the cost.
          const safeMonthly = friendlyPrice(
            cost.total / ((1 - cap / 100) * (1 - fee) * (1 - margin)),
          );
          return (
            <div key={code} className="border-line rounded-2xl border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-medium">
                  {plan.name}{' '}
                  <span className="text-muted text-sm font-normal">
                    · {plan.storageGB} GB · cost about <Money value={cost.total} />
                    /month per account
                  </span>
                </h4>
                <p className="text-muted text-xs">
                  Storage <Money value={cost.storage} /> · Downloads{' '}
                  <Money value={cost.downloads} /> · AI <Money value={cost.ai} />
                </p>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead className="text-muted text-left text-xs">
                    <tr>
                      <th className="py-1 font-normal">Bought as</th>
                      <th className="py-1 text-right font-normal">Price / month</th>
                      <th className="py-1 text-right font-normal">After fee</th>
                      <th className="py-1 text-right font-normal">Profit / month</th>
                      <th className="py-1 text-right font-normal">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios(plan, offer, cap).map((row) => {
                      const net = row.perMonth * (1 - fee);
                      const profit = net - cost.total;
                      const pct = row.perMonth > 0 ? (profit / row.perMonth) * 100 : 0;
                      const tone =
                        profit < 0 ? 'text-danger' : pct < 30 ? 'text-warning' : 'text-success';
                      return (
                        <tr key={row.key} className="border-line border-t">
                          <td className="py-1.5" title={row.hint}>
                            {row.label}
                          </td>
                          <td className="py-1.5 text-right">
                            <Money value={row.perMonth} />
                          </td>
                          <td className="py-1.5 text-right">
                            <Money value={net} />
                          </td>
                          <td className={cn('py-1.5 text-right font-medium', tone)}>
                            <Money value={profit} />
                          </td>
                          <td className={cn('py-1.5 text-right tabular-nums', tone)}>
                            {Math.round(pct)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-muted mt-2 text-xs">
                For a {guess.targetMargin}% margin: monthly at least{' '}
                <span className="text-ink font-medium">{formatInr(suggested)}</span>; to keep that
                margin even at the lowest discounted price,{' '}
                <span className="text-ink font-medium">{formatInr(safeMonthly)}</span>.
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-muted text-xs">
        Uses ₹{model.usdToInr}/$, S3 ${model.s3PricePerGbMonthUsd}/GB-month, downloads $
        {model.egressPricePerGbUsd}/GB and AI ${model.aiPricePerMillionTokensUsd} per million tokens
        (Admin → Expenses). Server, domain and other fixed costs are not split per account here.
        Prices are before GST; GST is passed on, not earned.
      </p>
    </div>
  );
}
