// Indian GST for a single line of software service.
//   Same state as the seller  -> CGST + SGST, half the rate each.
//   Different state           -> IGST at the full rate.
// The place of supply is the buyer's state: from their GSTIN when they have
// one, else the state in their billing address, else the seller's own state.

// GST state codes (first two digits of a GSTIN).
export const GST_STATES = Object.freeze({
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  10: 'Bihar',
  11: 'Sikkim',
  12: 'Arunachal Pradesh',
  13: 'Nagaland',
  14: 'Manipur',
  15: 'Mizoram',
  16: 'Tripura',
  17: 'Meghalaya',
  18: 'Assam',
  19: 'West Bengal',
  20: 'Jharkhand',
  21: 'Odisha',
  22: 'Chhattisgarh',
  23: 'Madhya Pradesh',
  24: 'Gujarat',
  26: 'Dadra and Nagar Haveli and Daman and Diu',
  27: 'Maharashtra',
  29: 'Karnataka',
  30: 'Goa',
  31: 'Lakshadweep',
  32: 'Kerala',
  33: 'Tamil Nadu',
  34: 'Puducherry',
  35: 'Andaman and Nicobar Islands',
  36: 'Telangana',
  37: 'Andhra Pradesh',
  38: 'Ladakh',
  97: 'Other Territory',
});

const ALIASES = {
  'new delhi': '07',
  'nct of delhi': '07',
  orissa: '21',
  pondicherry: '34',
  'j&k': '01',
  'jammu & kashmir': '01',
  'andaman & nicobar islands': '35',
  'daman and diu': '26',
  'dadra and nagar haveli': '26',
  up: '09',
  mp: '23',
  tn: '33',
  ka: '29',
  mh: '27',
};

const normalise = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const NAME_TO_CODE = new Map(
  Object.entries(GST_STATES).map(([code, name]) => [normalise(name), code]),
);

export function stateCodeFromGstin(gstin) {
  const code = gstin?.slice(0, 2);
  return code && GST_STATES[code] ? code : null;
}

export function stateCodeFromName(name) {
  if (!name) return null;
  const key = normalise(name);
  return NAME_TO_CODE.get(key) ?? ALIASES[key] ?? null;
}

function stateName(code) {
  return GST_STATES[code] ?? null;
}

const round2 = (value) => Math.round(value * 100) / 100;

function placeOfSupply(buyer, sellerStateCode) {
  const code =
    stateCodeFromGstin(buyer?.gstin) ?? stateCodeFromName(buyer?.state) ?? sellerStateCode;
  return code ? { code, name: stateName(code) } : null;
}

/**
 * Works out the tax on one amount.
 * `inclusive: false` adds GST on top of `amount` (online checkout: prices are "plus GST").
 * `inclusive: true` treats `amount` as the total received (payments recorded by hand).
 * `rules` come from billingSettings.getGstRules() (the admin's invoicing settings).
 * Returns { taxableAmount, total, tax } where tax is null when no GST applies.
 */
export function computeGst(amount, { rules, buyer, inclusive = false }) {
  const settings = rules;
  if (!settings?.applies)
    return { taxableAmount: round2(amount), total: round2(amount), tax: null };

  const { rate } = settings;
  const taxableAmount = inclusive ? round2((amount * 100) / (100 + rate)) : round2(amount);
  const taxAmount = inclusive ? round2(amount - taxableAmount) : round2((amount * rate) / 100);
  const supply = placeOfSupply(buyer, settings.sellerStateCode);
  const interState = Boolean(
    supply && settings.sellerStateCode && supply.code !== settings.sellerStateCode,
  );
  const cgst = interState ? 0 : round2(taxAmount / 2);

  return {
    taxableAmount,
    total: round2(taxableAmount + taxAmount),
    tax: {
      rate,
      amount: taxAmount,
      interState,
      cgst,
      sgst: interState ? 0 : round2(taxAmount - cgst),
      igst: interState ? taxAmount : 0,
      placeOfSupply: supply,
      sellerGstin: settings.sellerGstin,
      buyerGstin: buyer?.gstin ?? null,
      sacCode: settings.sacCode,
    },
  };
}
