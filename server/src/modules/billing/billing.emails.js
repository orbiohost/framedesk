import { APP_NAME } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { PLANS } from '../plans/plans.catalog.js';

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});
const moneyFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const formatDate = (value) => dateFormat.format(new Date(value));
const planName = (code) => PLANS.find((plan) => plan.code === code)?.name ?? 'your';
const upgradeLink = (workspace) => `${env.CLIENT_URL}/w/${workspace._id}/upgrade`;
const billingLink = (workspaceId) => `${env.CLIENT_URL}/w/${workspaceId}/account?tab=billing`;

export function renewalReminderEmail({ workspace, owner }) {
  const { planCode, currentPeriodEnd } = workspace.billing;
  return {
    to: owner.email,
    subject: `Your ${APP_NAME} plan ends on ${formatDate(currentPeriodEnd)}`,
    text: [
      `Hi ${owner.name},`,
      '',
      `The ${planName(planCode)} plan for ${workspace.name} is paid until ${formatDate(currentPeriodEnd)}. Plans don't renew automatically, so nothing will be charged.`,
      '',
      'To keep uploading without a break, renew here (the new period is added after the current one, so you lose nothing by paying early):',
      upgradeLink(workspace),
    ].join('\n'),
  };
}

export function planExpiredEmail({ workspace, owner, graceEndsAt }) {
  return {
    to: owner.email,
    subject: `Your ${APP_NAME} plan has ended`,
    text: [
      `Hi ${owner.name},`,
      '',
      `The ${planName(workspace.billing.planCode)} plan for ${workspace.name} ended on ${formatDate(workspace.billing.currentPeriodEnd)}.`,
      '',
      `Everything keeps working until ${formatDate(graceEndsAt)}. After that the workspace becomes read-only: your files stay safe and can still be viewed and downloaded, but new uploads are paused until you renew.`,
      '',
      'Renew here:',
      upgradeLink(workspace),
    ].join('\n'),
  };
}

// `payment` is the DTO the invoice is rendered from; `pdf` is that invoice.
export function paymentReceiptEmail({ payment, billedTo, pdf, fileName }) {
  return {
    to: billedTo.email,
    subject: `Payment received: invoice ${payment.invoiceNumber}`,
    text: [
      `Hi ${billedTo.name},`,
      '',
      `We received ${moneyFormat.format(payment.amount)} for the ${payment.planName} plan (${payment.interval}) on ${payment.workspaceName}.`,
      `It is paid until ${formatDate(payment.periodEnd)}.`,
      '',
      'Your invoice is attached. You can also find every invoice here:',
      billingLink(payment.workspaceId),
    ].join('\n'),
    attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
  };
}
