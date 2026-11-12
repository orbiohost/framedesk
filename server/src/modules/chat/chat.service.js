import { AppError } from '../../utils/AppError.js';
import { Message } from './message.model.js';

const DEFAULT_LIMIT = 50;

export function toMessageDto(message) {
  const author = message.authorId;
  return {
    id: String(message._id),
    body: message.body,
    author: author?._id ? { id: String(author._id), name: author.name } : null,
    createdAt: message.createdAt,
  };
}

// The newest messages, returned oldest first so the chat reads top to bottom.
export async function listMessages(workspaceId, { limit = DEFAULT_LIMIT } = {}) {
  const messages = await Message.find({ workspaceId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .populate('authorId', 'name')
    .lean();
  return messages.reverse().map(toMessageDto);
}

export async function createMessage(workspaceId, userId, { body }) {
  const message = await Message.create({ workspaceId, authorId: userId, body });
  await message.populate('authorId', 'name');
  return toMessageDto(message);
}

// Authors can delete their own messages; admins can delete any.
export async function deleteMessage(workspaceId, messageId, { userId, isAdmin }) {
  const message = await Message.findOne({ _id: messageId, workspaceId }).lean();
  if (!message) throw AppError.notFound('Message not found');
  if (!isAdmin && String(message.authorId) !== String(userId)) {
    throw AppError.forbidden('You can only delete your own messages');
  }
  await Message.deleteOne({ _id: messageId, workspaceId });
}
