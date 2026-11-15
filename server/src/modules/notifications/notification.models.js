import mongoose, { Schema } from 'mongoose';

// One browser or installed app that turned notifications on. The endpoint is
// the push service's address for that device (Google, Apple, Mozilla...).
const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 256 },
      auth: { type: String, required: true, maxlength: 64 },
    },
    // "Chrome on Android", shown in settings so people can tell devices apart.
    label: { type: String, maxlength: 80, default: null },
    lastSuccessAt: { type: Date, default: null },
    failures: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);

// Each reminder that went out, so it is sent once even with several API
// processes or a restart mid-sweep. The key names the item, the person and
// the moment, so moving an event re-arms its reminders.
const sentReminderSchema = new Schema({
  key: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 45 },
});

export const SentReminder = mongoose.model('SentReminder', sentReminderSchema);
