import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { getCatalog } from '../plans/plans.service.js';
import { User } from '../users/user.model.js';
import { COUPON_CODE, Coupon, CouponRedemption } from './coupon.model.js';
import { Payment } from './payment.model.js';

// Money off a plan at checkout: a coupon the owner types, or the referral
// discount a referred account gets on its first paid plan. They don't stack;
// whichever saves more is used. The plan price (offer included) is what they
// come off, and the result never drops below the plan's price floor (the
// admin's discount cap, Admin → Plans & coupons) or ₹1 (Razorpay's minimum).

export const REFERRAL_DISCOUNT_CODE = 'REFERRAL';

function invalid(message) {
  return AppError.badRequest(message, 'COUPON_INVALID');
}

export function normaliseCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase();
}

function cut(amount, { percentOff, amountOff }) {
  const off = percentOff ? Math.round((amount * percentOff) / 100) : Math.round(amountOff);
  return Math.max(0, Math.min(off, amount - 1));
}

// Throws a readable reason when the coupon can't be used for this purchase.
async function couponDiscount(code, { pool, planCode, interval, amount }, now = new Date()) {
  if (!COUPON_CODE.test(code)) throw invalid('That coupon code is not valid');
  const coupon = await Coupon.findOne({ code }).lean();
  if (!coupon || !coupon.active) throw invalid('That coupon code is not valid');
  if (coupon.startsAt && coupon.startsAt > now) throw invalid('That coupon is not active yet');
  if (coupon.expiresAt && coupon.expiresAt < now) throw invalid('That coupon has expired');
  if (coupon.planCodes.length && !coupon.planCodes.includes(planCode)) {
    throw invalid('That coupon is not for this plan');
  }
  if (coupon.intervals.length && !coupon.intervals.includes(interval)) {
    throw invalid(`That coupon is only for ${coupon.intervals.join(' or ')} billing`);
  }
  if (coupon.maxRedemptions && coupon.redemptions >= coupon.maxRedemptions) {
    throw invalid('That coupon has been fully used');
  }
  const used = await CouponRedemption.countDocuments({
    workspaceId: pool._id,
    couponId: coupon._id,
  });
  if (used >= (coupon.perAccountLimit ?? 1)) {
    throw invalid('You have already used this coupon');
  }
  return {
    kind: 'coupon',
    code: coupon.code,
    couponId: coupon._id,
    percentOff: coupon.percentOff ?? null,
    amount: cut(amount, coupon),
    label: coupon.percentOff ? `${coupon.percentOff}% off` : `₹${coupon.amountOff} off`,
  };
}

// A referred account's first paid plan.
async function referralDiscount(pool, amount) {
  const { referral } = await getCatalog();
  if (!referral.enabled || !referral.discountPercent) return null;
  const owner = await User.findById(pool.ownerId)
    .select('referredBy referralDiscountUsedAt')
    .lean();
  if (!owner?.referredBy || owner.referralDiscountUsedAt) return null;
  const paidBefore = await Payment.exists({ workspaceId: pool._id, kind: 'plan' });
  if (paidBefore) return null;
  return {
    kind: 'referral',
    code: REFERRAL_DISCOUNT_CODE,
    couponId: null,
    percentOff: referral.discountPercent,
    amount: cut(amount, { percentOff: referral.discountPercent }),
    label: `${referral.discountPercent}% referral discount`,
  };
}

// Never takes the price below the floor; says so on the label when it had to stop short.
function capped(discount, room) {
  if (!discount || discount.amount <= room) return discount;
  return { ...discount, amount: room, label: `${discount.label} (capped at the lowest price)` };
}

/**
 * The best discount for a plan purchase, or null. `amount` is the plan price
 * before GST; `floor` the least it may come down to (from quote()). A coupon
 * that doesn't apply throws, so the owner sees why.
 */
export async function discountFor({ pool, planCode, interval, amount, couponCode, floor = 1 }) {
  const code = normaliseCode(couponCode);
  const room = Math.max(0, amount - Math.max(1, floor));
  const [coupon, referral] = await Promise.all([
    code ? couponDiscount(code, { pool, planCode, interval, amount }) : null,
    referralDiscount(pool, amount),
  ]);
  if (coupon && coupon.amount > 0 && room === 0) {
    throw invalid('This price is already as low as it goes, so the coupon cannot take more off');
  }
  const best = [capped(coupon, room), capped(referral, room)]
    .filter((discount) => discount && discount.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0];
  return best ?? null;
}

/** After the payment is recorded: counts the coupon use, or spends the referral discount. */
export async function recordDiscountUse({ pool, paymentId, discount }) {
  if (!discount?.kind) return;
  try {
    if (discount.kind === 'referral') {
      await User.updateOne(
        { _id: pool.ownerId, referralDiscountUsedAt: null },
        { $set: { referralDiscountUsedAt: new Date() } },
      );
      return;
    }
    const coupon = await Coupon.findOne({ code: discount.code }).select('_id').lean();
    if (!coupon) return;
    await CouponRedemption.create({
      workspaceId: pool._id,
      couponId: coupon._id,
      code: discount.code,
      paymentId,
      discount: discount.amount,
    });
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { redemptions: 1 } });
  } catch (error) {
    // Already counted for this payment (checkout and webhook both got here).
    if (error?.code !== 11000) logger.error({ err: error }, 'Could not record a discount use');
  }
}

// --- Admin -------------------------------------------------------------

function toCouponDto(coupon) {
  return {
    id: String(coupon._id),
    code: coupon.code,
    description: coupon.description,
    percentOff: coupon.percentOff,
    amountOff: coupon.amountOff,
    planCodes: coupon.planCodes,
    intervals: coupon.intervals,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    maxRedemptions: coupon.maxRedemptions,
    perAccountLimit: coupon.perAccountLimit,
    redemptions: coupon.redemptions,
    active: coupon.active,
    createdAt: coupon.createdAt,
  };
}

export async function listCoupons() {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).limit(500).lean();
  return coupons.map(toCouponDto);
}

function couponFields(input) {
  if (Boolean(input.percentOff) === Boolean(input.amountOff)) {
    throw AppError.badRequest('Give either a percentage or an amount off', 'COUPON_VALUE');
  }
  return {
    description: input.description || null,
    percentOff: input.percentOff || null,
    amountOff: input.amountOff || null,
    planCodes: input.planCodes ?? [],
    intervals: input.intervals ?? [],
    startsAt: input.startsAt ?? null,
    expiresAt: input.expiresAt ?? null,
    maxRedemptions: input.maxRedemptions || null,
    perAccountLimit: input.perAccountLimit || 1,
    active: input.active ?? true,
  };
}

export async function createCoupon(input, adminId) {
  const code = normaliseCode(input.code);
  if (!COUPON_CODE.test(code)) {
    throw AppError.badRequest(
      'Codes are 3–30 letters, numbers, - or _ (e.g. DIWALI25)',
      'COUPON_CODE',
    );
  }
  try {
    const coupon = await Coupon.create({ code, ...couponFields(input), createdBy: adminId });
    return toCouponDto(coupon);
  } catch (error) {
    if (error?.code === 11000) throw AppError.conflict('That code already exists', 'COUPON_TAKEN');
    throw error;
  }
}

export async function updateCoupon(couponId, input) {
  const coupon = await Coupon.findByIdAndUpdate(
    couponId,
    { $set: couponFields(input) },
    { new: true, runValidators: true },
  ).lean();
  if (!coupon) throw AppError.notFound('Coupon not found');
  return toCouponDto(coupon);
}

// A coupon that was used stays (its uses are on invoices); it is switched off instead.
export async function deleteCoupon(couponId) {
  const coupon = await Coupon.findById(couponId).lean();
  if (!coupon) throw AppError.notFound('Coupon not found');
  if (coupon.redemptions > 0) {
    await Coupon.updateOne({ _id: couponId }, { $set: { active: false } });
    return { deleted: false, deactivated: true };
  }
  await Coupon.deleteOne({ _id: couponId });
  return { deleted: true, deactivated: false };
}
