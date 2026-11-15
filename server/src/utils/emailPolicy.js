import { Resolver } from 'node:dns/promises';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// Who may open an account. Throwaway inboxes (Mailinator, 10 Minute Mail,
// Temp-Mail, YOPmail...) are refused, as are domains that can't receive mail
// at all. In "strict" mode, free consumer mailboxes other than Gmail are
// refused too, so only Gmail and company addresses get in.

// Big real providers: never disposable, no DNS lookup needed.
const TRUSTED_PROVIDERS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.in',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'zohomail.in',
  'aol.com',
  'gmx.com',
  'rediffmail.com',
]);

// Free consumer mailboxes refused in strict mode (Gmail stays allowed).
const FREE_PROVIDERS = new Set(
  [...TRUSTED_PROVIDERS].filter((d) => d !== 'gmail.com' && d !== 'googlemail.com'),
);

// Known disposable / temporary inbox domains. Subdomains match too.
const DISPOSABLE_DOMAINS = new Set([
  // Mailinator and its aliases
  'mailinator.com',
  'mailinator.net',
  'mailinator2.com',
  'mailinater.com',
  'notmailinator.com',
  'binkmail.com',
  'bobmail.info',
  'chammy.info',
  'devnullmail.com',
  'letthemeatspam.com',
  'monumentmail.com',
  'reallymymail.com',
  'sogetthis.com',
  'spamhereplease.com',
  'streetwisemail.com',
  'suremail.info',
  'thisisnotmyrealemail.com',
  'tradermail.info',
  'veryrealemail.com',
  'zippymail.info',
  // Guerrilla Mail
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'pokemail.net',
  'spam4.me',
  // 10/20/30 minute mail and friends
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.co.uk',
  '20minutemail.com',
  '30minutemail.com',
  'minuteinbox.com',
  'mailexpire.com',
  '10mail.org',
  // Temp-Mail style services
  'temp-mail.org',
  'temp-mail.io',
  'temp-mail.ru',
  'tempmail.com',
  'tempmail.net',
  'tempmail.dev',
  'tempmail.plus',
  'tempmailo.com',
  'tempmailaddress.com',
  'tempinbox.com',
  'tempail.com',
  'tempr.email',
  'tmpmail.org',
  'tmpmail.net',
  'tmail.ws',
  'tmails.net',
  'emltmp.com',
  'tmpeml.com',
  'tmpbox.net',
  'emailtemporanea.net',
  'crazymailing.com',
  // tempmail.plus domains
  'mailto.plus',
  'fexpost.com',
  'fexbox.org',
  'mailbox.in.ua',
  'rover.info',
  'chitthi.in',
  'fextemp.com',
  'any.pink',
  'merepost.com',
  // 1secmail domains
  '1secmail.com',
  '1secmail.net',
  '1secmail.org',
  'esiix.com',
  'wwjmp.com',
  'xojxe.com',
  'yoggm.com',
  'kzccv.com',
  'qiott.com',
  'dpptd.com',
  'vjuum.com',
  'laafd.com',
  'txcct.com',
  'rteet.com',
  'dcctb.com',
  // YOPmail and its alternates
  'yopmail.com',
  'yopmail.net',
  'yopmail.fr',
  'cool.fr.nf',
  'jetable.fr.nf',
  'nospam.ze.tc',
  'nomail.xl.cx',
  'mega.zik.dj',
  'speed.1s.fr',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'yomail.info',
  // Fake Mail Generator domains
  'fakemailgenerator.com',
  'armyspy.com',
  'cuvox.de',
  'dayrep.com',
  'einrot.com',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'teleworm.us',
  // Others
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'trashmail.me',
  'trashmail.io',
  'mytrashmail.com',
  'dispostable.com',
  'maildrop.cc',
  'mailnesia.com',
  'mailcatch.com',
  'getnada.com',
  'nada.email',
  'getairmail.com',
  'fakeinbox.com',
  'fakemail.net',
  'emailfake.com',
  'emailondeck.com',
  'mohmal.com',
  'mintemail.com',
  'mailpoof.com',
  'burnermail.io',
  'spamgourmet.com',
  'spambox.us',
  'incognitomail.org',
  'mailforspam.com',
  'discard.email',
  'discardmail.com',
  'spamex.com',
  'harakirimail.com',
  'mvrht.com',
  'mailnull.com',
  'spamfree24.org',
  'e4ward.com',
  'spamdecoy.net',
  'inboxbear.com',
  'inboxkitten.com',
  'mail7.io',
  'mailsac.com',
  'moakt.com',
  'dropmail.me',
  'emlhub.com',
  'emlpro.com',
  'luxusmail.org',
  'trbvm.com',
  'mailhazard.com',
]);

// Words that only show up in throwaway services' domains and mail servers.
const DISPOSABLE_HINT =
  /(temp-?mail|tmp-?mail|10-?minute|minute-?mail|throw-?away|trash-?mail|disposable|guerrilla-?mail|mailinator|yopmail|fake-?mail|burner-?mail|spam-?(box|gourmet|4)|getnada|maildrop|1secmail)/i;

function extraBlockedDomains() {
  return new Set(
    (env.EMAIL_BLOCKED_DOMAINS || '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
}

// "a.b.mailinator.com" -> ["a.b.mailinator.com", "b.mailinator.com", "mailinator.com"]
function domainAndParents(domain) {
  const parts = domain.split('.');
  const list = [];
  for (let i = 0; i < parts.length - 1; i += 1) list.push(parts.slice(i).join('.'));
  return list;
}

function looksDisposable(domain) {
  const extra = extraBlockedDomains();
  return (
    DISPOSABLE_HINT.test(domain) ||
    domainAndParents(domain).some((d) => DISPOSABLE_DOMAINS.has(d) || extra.has(d))
  );
}

const resolver = new Resolver({ timeout: 3000, tries: 2 });
const mxCache = new Map(); // domain -> { ok, reason, at }
const MX_CACHE_MS = 60 * 60 * 1000;

// Can this domain receive mail, and not through a throwaway service?
async function checkMailServers(domain) {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.at < MX_CACHE_MS) return cached;

  let result;
  try {
    const records = await resolver.resolveMx(domain);
    const hosts = records
      .map((r) => String(r.exchange).toLowerCase())
      .filter((h) => h && h !== '.');
    if (hosts.length === 0) result = { ok: false, reason: 'no_mail' };
    else if (hosts.some((h) => DISPOSABLE_HINT.test(h) || looksDisposable(h)))
      result = { ok: false, reason: 'disposable' };
    else result = { ok: true };
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'NXDOMAIN') {
      result = { ok: false, reason: 'no_mail' };
    } else {
      // DNS is having a bad moment: let the person in rather than lock out
      // real customers. The email-verification step still applies.
      logger.warn({ domain, code: err.code }, 'MX lookup failed; allowing signup');
      return { ok: true };
    }
  }
  mxCache.set(domain, { ...result, at: Date.now() });
  return result;
}

const MESSAGES = {
  disposable:
    'Temporary or disposable email addresses can’t be used. Please sign up with Gmail or your work email.',
  no_mail: 'This email domain can’t receive mail. Please check the address or use another one.',
  free_provider: 'Please sign up with a Gmail address or your work email.',
};

/**
 * Returns null when the address may be used to open an account, otherwise
 * { reason, message }. Pass { skipDns: true } when the address is already
 * proven to receive mail (e.g. it came from Google).
 */
export async function checkSignupEmail(email, { skipDns = false } = {}) {
  const domain = String(email).split('@').pop().toLowerCase().trim();
  if (!domain) return { reason: 'no_mail', message: MESSAGES.no_mail };

  if (looksDisposable(domain)) return { reason: 'disposable', message: MESSAGES.disposable };
  if (env.EMAIL_SIGNUP_MODE === 'strict' && FREE_PROVIDERS.has(domain)) {
    return { reason: 'free_provider', message: MESSAGES.free_provider };
  }
  if (TRUSTED_PROVIDERS.has(domain) || skipDns) return null;

  const mx = await checkMailServers(domain);
  return mx.ok ? null : { reason: mx.reason, message: MESSAGES[mx.reason] };
}
