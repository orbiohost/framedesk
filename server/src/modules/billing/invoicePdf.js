// Builds an A4 invoice as a PDF with no dependencies: the standard Helvetica
// fonts (every PDF reader has them), WinAnsi text, rectangles and lines.

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_RIGHT = PAGE.width - MARGIN;

const COLORS = {
  ink: [0.086, 0.082, 0.106],
  muted: [0.44, 0.427, 0.486],
  line: [0.89, 0.875, 0.925],
  subtle: [0.965, 0.957, 0.98],
  accent: [0.545, 0.33, 0.91],
  success: [0.133, 0.55, 0.33],
  successTint: [0.9, 0.96, 0.92],
};

// Advance widths (1/1000 em) for characters 32-126, from the Adobe AFM files.
// prettier-ignore
const WIDTHS = {
  regular: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  bold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
};

// Characters outside Latin-1 that WinAnsi still has a slot for.
const WIN_ANSI_EXTRAS = { '—': 0x97, '–': 0x96, '•': 0x95, '’': 0x92 };
const EXTRA_WIDTHS = { 0x97: 1000, 0x96: 556, 0x95: 350, 0x92: 222 };

function toWinAnsiCodes(text) {
  const codes = [];
  for (const char of String(text ?? '').replace(/₹/g, 'Rs. ')) {
    const code = char.codePointAt(0);
    if (WIN_ANSI_EXTRAS[char]) codes.push(WIN_ANSI_EXTRAS[char]);
    else if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) codes.push(code);
    else if (code === 9) codes.push(32);
    else codes.push(63); // "?"
  }
  return codes;
}

export function textWidth(text, size, font = 'regular') {
  const units = toWinAnsiCodes(text).reduce((sum, code) => {
    if (code >= 32 && code <= 126) return sum + WIDTHS[font][code - 32];
    return sum + (EXTRA_WIDTHS[code] ?? 556);
  }, 0);
  return (units * size) / 1000;
}

function pdfString(text) {
  const bytes = toWinAnsiCodes(text).map((code) => {
    const char = String.fromCharCode(code);
    if (char === '(' || char === ')' || char === '\\') return `\\${char}`;
    if (code > 126) return `\\${code.toString(8).padStart(3, '0')}`;
    return char;
  });
  return `(${bytes.join('')})`;
}

const num = (value) => Number(value.toFixed(2)).toString();
const rgb = ([r, g, b]) => `${num(r)} ${num(g)} ${num(b)}`;

// Collects drawing operators. y is measured from the top of the page.
class Canvas {
  constructor() {
    this.ops = [];
  }

  text(value, x, y, { size = 10, font = 'regular', color = COLORS.ink, align = 'left' } = {}) {
    const width = textWidth(value, size, font);
    const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    const fontName = font === 'bold' ? 'F2' : 'F1';
    this.ops.push(
      `BT ${rgb(color)} rg /${fontName} ${size} Tf ${num(left)} ${num(PAGE.height - y)} Td ${pdfString(value)} Tj ET`,
    );
  }

  // Shortens text with "..." until it fits in `maxWidth`.
  fitText(value, maxWidth, size, font = 'regular') {
    let text = String(value ?? '');
    if (textWidth(text, size, font) <= maxWidth) return text;
    while (text.length > 1 && textWidth(`${text}...`, size, font) > maxWidth) {
      text = text.slice(0, -1);
    }
    return `${text.trimEnd()}...`;
  }

  rect(x, y, width, height, color) {
    this.ops.push(
      `${rgb(color)} rg ${num(x)} ${num(PAGE.height - y - height)} ${num(width)} ${num(height)} re f`,
    );
  }

  roundedRect(x, y, width, height, radius, color) {
    const k = 0.5523 * radius;
    const top = PAGE.height - y;
    const bottom = top - height;
    const right = x + width;
    this.ops.push(
      [
        `${rgb(color)} rg`,
        `${num(x + radius)} ${num(top)} m`,
        `${num(right - radius)} ${num(top)} l`,
        `${num(right - radius + k)} ${num(top)} ${num(right)} ${num(top - radius + k)} ${num(right)} ${num(top - radius)} c`,
        `${num(right)} ${num(bottom + radius)} l`,
        `${num(right)} ${num(bottom + radius - k)} ${num(right - radius + k)} ${num(bottom)} ${num(right - radius)} ${num(bottom)} c`,
        `${num(x + radius)} ${num(bottom)} l`,
        `${num(x + radius - k)} ${num(bottom)} ${num(x)} ${num(bottom + radius - k)} ${num(x)} ${num(bottom + radius)} c`,
        `${num(x)} ${num(top - radius)} l`,
        `${num(x)} ${num(top - radius + k)} ${num(x + radius - k)} ${num(top)} ${num(x + radius)} ${num(top)} c`,
        'f',
      ].join(' '),
    );
  }

  line(x1, y1, x2, y2, color = COLORS.line, width = 0.75) {
    this.ops.push(
      `${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(PAGE.height - y1)} m ${num(x2)} ${num(PAGE.height - y2)} l S`,
    );
  }

  toString() {
    return this.ops.join('\n');
  }
}

function assemble(content, { title }) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    `<< /Title ${pdfString(title)} /Producer ${pdfString('FrameDesk')} >>`,
  ];

  let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const METHOD_LABELS = {
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
  razorpay: 'Razorpay',
  other: 'Other',
};

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});
const moneyFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatDate = (value) => dateFormat.format(new Date(value));
const formatMoney = (amount, currency = 'INR') => `${currency} ${moneyFormat.format(amount)}`;

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

const RAZORPAY_METHODS = {
  upi: 'UPI',
  card: 'card',
  netbanking: 'netbanking',
  wallet: 'wallet',
  emi: 'EMI',
  paylater: 'pay later',
};

export function methodLabel(payment) {
  const base = METHOD_LABELS[payment.method] ?? payment.method;
  const via = RAZORPAY_METHODS[payment.razorpayMethod] ?? payment.razorpayMethod;
  return payment.method === 'razorpay' && via ? `${base} (${via})` : base;
}

const percent = (value) => `${Number(value.toFixed(2))}%`;

// Rows above the grand total: the taxable value, then the GST split.
export function totalRows(payment) {
  const { tax } = payment;
  const rows = [[tax ? 'Taxable value' : 'Subtotal', payment.taxableAmount ?? payment.amount]];
  if (tax?.interState) rows.push([`IGST @ ${percent(tax.rate)}`, tax.igst]);
  else if (tax) {
    rows.push([`CGST @ ${percent(tax.rate / 2)}`, tax.cgst]);
    rows.push([`SGST @ ${percent(tax.rate / 2)}`, tax.sgst]);
  }
  return rows;
}

// `invoice` is what accountBilling.getInvoice returns.
export function renderInvoicePdf({ payment, seller, billedTo }) {
  const canvas = new Canvas();
  const left = MARGIN;
  const right = CONTENT_RIGHT;

  // Accent strip and header.
  canvas.rect(0, 0, PAGE.width, 6, COLORS.accent);
  canvas.text(seller.name, left, 62, { size: 20, font: 'bold' });
  canvas.text(payment.tax ? 'TAX INVOICE' : 'INVOICE', right, 62, {
    size: 20,
    font: 'bold',
    color: COLORS.accent,
    align: 'right',
  });

  let sellerY = 82;
  const sellerLines = [
    ...(seller.addressLines ?? []),
    [seller.email, seller.phone].filter(Boolean).join('  •  '),
    seller.gstin && `GSTIN ${seller.gstin}`,
  ].filter(Boolean);
  for (const line of sellerLines.slice(0, 7)) {
    canvas.text(canvas.fitText(line, 300, 9), left, sellerY, { size: 9, color: COLORS.muted });
    sellerY += 13;
  }

  const meta = [
    ['Invoice no.', payment.invoiceNumber],
    ['Invoice date', formatDate(payment.paidAt)],
    ['Workspace', canvas.fitText(payment.workspaceName, 150, 9, 'bold')],
    payment.tax?.placeOfSupply && [
      'Place of supply',
      canvas.fitText(
        `${payment.tax.placeOfSupply.name} (${payment.tax.placeOfSupply.code})`,
        150,
        9,
        'bold',
      ),
    ],
  ].filter(Boolean);
  meta.forEach(([label, value], index) => {
    const y = 82 + index * 15;
    canvas.text(label, right - 160, y, { size: 9, color: COLORS.muted });
    canvas.text(value, right, y, { size: 9, font: 'bold', align: 'right' });
  });

  // Paid stamp.
  const stampY = 82 + meta.length * 15 + 4;
  canvas.roundedRect(right - 48, stampY, 48, 18, 9, COLORS.successTint);
  canvas.text('PAID', right - 24, stampY + 12.5, {
    size: 8.5,
    font: 'bold',
    color: COLORS.success,
    align: 'center',
  });

  // Billed to.
  let y = Math.max(sellerY, stampY + 18) + 28;
  canvas.line(left, y, right, y);
  y += 24;
  canvas.text('BILLED TO', left, y, { size: 8, font: 'bold', color: COLORS.muted });
  canvas.text('PAYMENT', right - 160, y, { size: 8, font: 'bold', color: COLORS.muted });
  y += 16;
  canvas.text(canvas.fitText(billedTo.name, 280, 11, 'bold'), left, y, { size: 11, font: 'bold' });

  const paymentLines = [
    ['Paid on', formatDate(payment.paidAt)],
    ['Method', methodLabel(payment)],
    payment.reference && ['Reference', canvas.fitText(payment.reference, 100, 9)],
  ].filter(Boolean);
  paymentLines.forEach(([label, value], index) => {
    const lineY = y + index * 14;
    canvas.text(label, right - 160, lineY, { size: 9, color: COLORS.muted });
    canvas.text(value, right, lineY, { size: 9, align: 'right' });
  });

  let billedY = y + 15;
  for (const line of billedToLines(billedTo).slice(0, 7)) {
    canvas.text(canvas.fitText(line, 280, 9.5), left, billedY, { size: 9.5, color: COLORS.muted });
    billedY += 13.5;
  }

  // Line items.
  y = Math.max(billedY, y + paymentLines.length * 14) + 30;
  const columns = { description: left + 14, period: left + 260, amount: right - 14 };
  canvas.roundedRect(left, y, right - left, 28, 8, COLORS.subtle);
  canvas.text('DESCRIPTION', columns.description, y + 18, {
    size: 8,
    font: 'bold',
    color: COLORS.muted,
  });
  canvas.text('SERVICE PERIOD', columns.period, y + 18, {
    size: 8,
    font: 'bold',
    color: COLORS.muted,
  });
  canvas.text('AMOUNT', columns.amount, y + 18, {
    size: 8,
    font: 'bold',
    color: COLORS.muted,
    align: 'right',
  });

  y += 50;
  const isCredits = payment.kind === 'credits';
  const isReset = payment.kind === 'reset';
  const intervalLabel = payment.interval === 'yearly' ? 'Yearly' : 'Monthly';
  canvas.text(
    isReset
      ? 'AI usage limit reset'
      : isCredits
        ? `${Number(payment.credits ?? 0).toLocaleString('en-IN')} AI credits`
        : `${payment.planName} plan`,
    columns.description,
    y,
    { size: 10.5, font: 'bold' },
  );
  canvas.text(
    isCredits || isReset
      ? formatDate(payment.paidAt)
      : `${formatDate(payment.periodStart)} – ${formatDate(payment.periodEnd)}`,
    columns.period,
    y,
    { size: 10 },
  );
  canvas.text(
    formatMoney(payment.taxableAmount ?? payment.amount, payment.currency),
    columns.amount,
    y,
    {
      size: 10.5,
      font: 'bold',
      align: 'right',
    },
  );
  y += 15;
  canvas.text(
    isReset
      ? '5-hour and weekly limits started over'
      : isCredits
        ? 'One-time credit pack'
        : `${intervalLabel} subscription`,
    columns.description,
    y,
    {
      size: 9,
      color: COLORS.muted,
    },
  );
  if (payment.tax?.sacCode) {
    y += 13;
    canvas.text(`SAC ${payment.tax.sacCode}`, columns.description, y, {
      size: 9,
      color: COLORS.muted,
    });
  }
  if (payment.offerCode) {
    y += 13;
    canvas.text(`Offer applied: ${payment.offerCode}`, columns.description, y, {
      size: 9,
      color: COLORS.accent,
    });
  }

  y += 22;
  canvas.line(left, y, right, y);

  // Totals.
  y += 8;
  for (const [label, value] of totalRows(payment)) {
    y += 14;
    canvas.text(label, right - 200, y, { size: 9.5, color: COLORS.muted });
    canvas.text(formatMoney(value, payment.currency), right - 14, y, { size: 9.5, align: 'right' });
  }
  y += 14;
  canvas.roundedRect(right - 214, y, 214, 34, 8, COLORS.subtle);
  canvas.text('Amount paid', right - 200, y + 21.5, { size: 10.5, font: 'bold' });
  canvas.text(formatMoney(payment.amount, payment.currency), right - 14, y + 21.5, {
    size: 12,
    font: 'bold',
    align: 'right',
  });
  if (payment.tax) {
    canvas.text(
      `Includes ${formatMoney(payment.tax.amount, payment.currency)} GST`,
      right - 14,
      y + 50,
      { size: 8.5, color: COLORS.muted, align: 'right' },
    );
  }

  // Footer.
  const footerY = PAGE.height - 70;
  canvas.line(left, footerY, right, footerY);
  const thanks = seller.footerNote || `Thank you for choosing ${seller.name}.`;
  canvas.text(canvas.fitText(thanks, right - left, 9.5, 'bold'), left, footerY + 20, {
    size: 9.5,
    font: 'bold',
  });
  canvas.text(
    'This is a computer-generated invoice and does not need a signature.',
    left,
    footerY + 34,
    { size: 8.5, color: COLORS.muted },
  );
  if (seller.email) {
    canvas.text(`Questions? ${seller.email}`, right, footerY + 34, {
      size: 8.5,
      color: COLORS.muted,
      align: 'right',
    });
  }

  return assemble(canvas.toString(), { title: `Invoice ${payment.invoiceNumber}` });
}

export function invoiceFileName(payment) {
  return `invoice-${payment.invoiceNumber.replace(/[^\w-]+/g, '-')}.pdf`;
}
