import { cn } from '../../lib/cn.js';
import { formatInrExact } from '../../lib/format.js';

const percent = (value) => `${Number(value.toFixed(2))}%`;

// Rows above the total: taxable value, then CGST + SGST or IGST.
export function taxRows({ taxableAmount, tax }) {
  const rows = [{ label: tax ? 'Taxable value' : 'Subtotal', value: taxableAmount }];
  if (tax?.interState) rows.push({ label: `IGST @ ${percent(tax.rate)}`, value: tax.igst });
  else if (tax) {
    rows.push({ label: `CGST @ ${percent(tax.rate / 2)}`, value: tax.cgst });
    rows.push({ label: `SGST @ ${percent(tax.rate / 2)}`, value: tax.sgst });
  }
  return rows;
}

// `totalLabel` e.g. "Total due" at checkout, "Amount paid" on an invoice.
export function TaxBreakdown({ taxableAmount, tax, amount, totalLabel, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      {taxRows({ taxableAmount, tax }).map((row) => (
        <div key={row.label} className="flex justify-between gap-6 text-sm">
          <span className="text-muted">{row.label}</span>
          <span className="tabular-nums">{formatInrExact(row.value)}</span>
        </div>
      ))}
      <div className="bg-subtle flex items-center justify-between rounded-xl px-4 py-3">
        <span className="text-sm font-semibold">{totalLabel}</span>
        <span className="text-lg font-semibold tabular-nums">{formatInrExact(amount)}</span>
      </div>
      {tax?.placeOfSupply && (
        <p className="text-muted text-right text-xs">
          Place of supply: {tax.placeOfSupply.name} ({tax.placeOfSupply.code})
        </p>
      )}
    </div>
  );
}
