// Loads Razorpay Checkout (their hosted script) on first use and opens it.
// Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;

function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export class CheckoutDismissed extends Error {
  constructor() {
    super('Payment window closed');
    this.name = 'CheckoutDismissed';
  }
}

function checkoutTimeoutSeconds(expiresAt) {
  const fallback = 15 * 60;
  const ms = expiresAt ? new Date(expiresAt).getTime() - Date.now() : NaN;
  if (!Number.isFinite(ms)) return fallback;
  return Math.max(60, Math.floor(ms / 1000) - 120);
}

/**
 * Opens the payment window for a checkout from the server.
 * Resolves with { orderId, paymentId, signature } once paid; rejects with
 * CheckoutDismissed if the person closes it, or an Error if the payment fails.
 */
export async function openRazorpayCheckout(checkout, { color } = {}) {
  await loadScript();
  return new Promise((resolve, reject) => {
    let lastFailure = null;
    const instance = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: checkout.businessName,
      description: checkout.description,
      prefill: checkout.prefill,
      theme: color ? { color } : undefined,
      // Close the window (in seconds) a little before the server stops honouring the order.
      timeout: checkoutTimeoutSeconds(checkout.expiresAt),
      handler: (response) =>
        resolve({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        }),
      modal: {
        // Razorpay lets people retry inside the window, so a failure only
        // ends the attempt once they close it.
        ondismiss: () => reject(lastFailure ?? new CheckoutDismissed()),
      },
    });
    instance.on('payment.failed', (response) => {
      lastFailure = new Error(response.error?.description ?? 'The payment did not go through.');
    });
    instance.open();
  });
}
