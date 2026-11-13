import { Download, ExternalLink } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { formatInrExact } from '../../lib/format.js';
import { paymentMethodLabel, shortDate } from '../admin/adminFormat.js';
import { TaxBreakdown } from '../billing/TaxBreakdown.jsx';
import { useInvoicePdf } from '../users/hooks.js';

function billedToLines(billedTo) {
  const cityLine = [billedTo.city, billedTo.state, billedTo.postalCode].filter(Boolean).join(', ');
  return [
    billedTo.companyName,
    billedTo.addressLine,
    cityLine,
    billedTo.country,
    billedTo.email,
    billedTo.phone,
    billedTo.gstin && `GSTIN ${billedTo.gstin}`,
  ].filter(Boolean);
}

function Label({ children }) {
  return (
    <p className="text-muted text-[11px] font-semibold uppercase tracking-[0.12em]">{children}</p>
  );
}

function MetaLine({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-6 text-sm">
      <span className="text-muted">{label}</span>
      <span className={strong ? 'font-semibold' : undefined}>{value}</span>
    </div>
  );
}

// The same invoice as the PDF, laid out for the screen.
function InvoiceSheet({ payment, seller, billedTo }) {
  const sellerLines = [
    ...(seller.addressLines ?? []),
    seller.email,
    seller.phone,
    seller.gstin && `GSTIN ${seller.gstin}`,
  ];
  return (
    <article className="border-line overflow-hidden rounded-2xl border">
      <div className="bg-accent h-1.5" />
      <div className="space-y-8 p-6 sm:p-8">
        <header className="flex flex-wrap justify-between gap-6">
          <div>
            <p className="font-display text-2xl">{seller.name}</p>
            <div className="text-muted mt-1 space-y-0.5 text-xs">
              {sellerLines.filter(Boolean).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="min-w-[14rem] space-y-1.5">
            <p className="font-display text-accent text-right text-2xl">
              {payment.tax ? 'Tax invoice' : 'Invoice'}
            </p>
            <MetaLine label="Invoice no." value={payment.invoiceNumber} strong />
            <MetaLine label="Invoice date" value={shortDate(payment.paidAt)} strong />
            <div className="flex justify-end pt-1">
              <span className="bg-success/10 text-success rounded-full px-2.5 py-0.5 text-xs font-semibold">
                Paid
              </span>
            </div>
          </div>
        </header>

        <div className="border-line grid gap-6 border-t pt-6 sm:grid-cols-2">
          <div>
            <Label>Billed to</Label>
            <p className="mt-1.5 font-semibold">{billedTo.name}</p>
            <div className="text-muted mt-0.5 space-y-0.5 text-sm">
              {billedToLines(billedTo).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <MetaLine label="Paid on" value={shortDate(payment.paidAt)} />
            <MetaLine label="Method" value={paymentMethodLabel(payment)} />
            {payment.reference && <MetaLine label="Reference" value={payment.reference} />}
            <MetaLine label="Workspace" value={payment.workspaceName} />
          </div>
        </div>

        <div>
          <div className="bg-subtle text-muted grid grid-cols-[1fr_auto] gap-4 rounded-xl px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] sm:grid-cols-[1fr_12rem_auto]">
            <span>Description</span>
            <span className="hidden sm:block">Service period</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-4 sm:grid-cols-[1fr_12rem_auto]">
            <div>
              <p className="font-semibold">{payment.planName} plan</p>
              <p className="text-muted text-sm">
                {payment.interval === 'yearly' ? 'Yearly' : 'Monthly'} subscription
              </p>
              {payment.tax?.sacCode && (
                <p className="text-muted text-sm">SAC {payment.tax.sacCode}</p>
              )}
              {payment.offerCode && (
                <p className="text-accent text-sm">Offer applied: {payment.offerCode}</p>
              )}
              <p className="text-muted text-sm sm:hidden">
                {shortDate(payment.periodStart)} – {shortDate(payment.periodEnd)}
              </p>
            </div>
            <p className="hidden text-sm sm:block">
              {shortDate(payment.periodStart)} – {shortDate(payment.periodEnd)}
            </p>
            <p className="text-right font-semibold tabular-nums">
              {formatInrExact(payment.taxableAmount)}
            </p>
          </div>
          <TaxBreakdown
            taxableAmount={payment.taxableAmount}
            tax={payment.tax}
            amount={payment.amount}
            totalLabel="Amount paid"
            className="border-line ml-auto max-w-xs border-t pt-4"
          />
        </div>
        {seller.footerNote && (
          <p className="text-muted border-line border-t pt-4 text-sm">{seller.footerNote}</p>
        )}
      </div>
    </article>
  );
}

export function InvoiceDialog({ payment, seller, billedTo, onClose }) {
  const pdf = useInvoicePdf();

  function openPdf() {
    // Opened during the click, so pop-up blockers allow it; filled once the PDF arrives.
    const target = window.open('', '_blank');
    pdf.mutate({ payment, mode: 'open', target });
  }

  return (
    <Dialog
      open={Boolean(payment)}
      onClose={onClose}
      wide
      title={payment ? `Invoice ${payment.invoiceNumber}` : 'Invoice'}
      description={payment ? `${payment.planName} plan · paid ${shortDate(payment.paidAt)}` : ''}
    >
      {payment && (
        <div className="space-y-4">
          {pdf.error && <Alert tone="error">{pdf.error.message}</Alert>}
          <InvoiceSheet
            payment={payment}
            seller={payment.seller ?? seller}
            billedTo={payment.billedTo ?? billedTo}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={openPdf} disabled={pdf.isPending}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open PDF
            </Button>
            <Button
              size="sm"
              loading={pdf.isPending}
              onClick={() => pdf.mutate({ payment, mode: 'download' })}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download PDF
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
