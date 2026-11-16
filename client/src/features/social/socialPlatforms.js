import { Facebook, Instagram, Linkedin, MessageCircle, Share2, Twitter, Youtube } from 'lucide-react';

// login: can be linked through the platform's own login (when the server has its keys).
// manualReason: why the rest are added by hand.
export const SOCIAL_PLATFORMS = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: Instagram,
    login: true,
    needs: [
      'A Professional Instagram account (Business or Creator). Switching is free: Instagram › Settings › Account type and tools.',
      'Log in with the Instagram account itself; no Facebook Page needed.',
    ],
    envKeys: 'INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: Facebook,
    login: true,
    needs: [
      'You must be an admin of the Facebook Page.',
      'When Facebook asks, tick every Page you want here. Each Page becomes its own channel.',
    ],
    envKeys: 'META_APP_ID / META_APP_SECRET',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: Youtube,
    login: true,
    needs: [
      'Sign in with the Google account that owns the channel (or choose its Brand Account).',
      'Allow "View your YouTube account" when Google asks.',
    ],
    envKeys: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET with YouTube Data API enabled',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: Share2,
    login: true,
    needs: ['Log in with TikTok and allow access to your profile, stats and video list.'],
    envKeys: 'TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    login: false,
    manualReason:
      'LinkedIn only opens post analytics to approved marketing partners, so add your numbers and posts by hand. You can copy them from LinkedIn › Analytics.',
  },
  {
    id: 'twitter',
    label: 'X (Twitter)',
    icon: Twitter,
    login: false,
    manualReason:
      "X charges for API access to post metrics, so add your numbers and posts by hand. You can copy them from each post's analytics.",
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    login: false,
    manualReason:
      'WhatsApp has no analytics API for channels and broadcasts. Add your follower count and paste the messages you send, with their views and replies.',
  },
];
