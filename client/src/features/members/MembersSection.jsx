import { Check, Copy, Loader2, Mail, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useCurrentUser } from '../auth/hooks.js';
import { canAdminister } from '../workspaces/roles.js';
import {
  ROLE_OPTIONS,
  useChangeMemberRole,
  useCreateInvite,
  useInvites,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
} from './hooks.js';

const SHORT_ROLES = ROLE_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label.split(':')[0],
}));

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', text);
    }
  }
  return (
    <Button type="button" size="sm" variant="secondary" onClick={copy}>
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

function InviteForm({ workspaceId }) {
  const invite = useCreateInvite(workspaceId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');

  function submit(event) {
    event.preventDefault();
    if (!email.trim()) return;
    invite.mutate({ email: email.trim(), role }, { onSuccess: () => setEmail('') });
  }

  const fieldError = invite.error?.details?.find((detail) => detail.field === 'email')?.message;

  return (
    <form onSubmit={submit} className="space-y-3">
      {invite.error && !fieldError && <Alert tone="error">{invite.error.message}</Alert>}
      {invite.isSuccess && (
        <Alert tone="success">
          <span className="block">
            Invite emailed to {invite.data.invite.email}. You can also send them this link (it works
            for 7 days, only for that email address):
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <code className="bg-surface max-w-full truncate rounded px-2 py-1 text-xs">
              {invite.data.link}
            </code>
            <CopyButton text={invite.data.link} />
          </span>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <TextField
          id="invite-email"
          label="Email address"
          type="email"
          placeholder="teammate@studio.com"
          value={email}
          error={fieldError}
          onChange={(event) => setEmail(event.target.value)}
        />
        <SelectField
          id="invite-role"
          label="Role"
          options={SHORT_ROLES}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        />
      </div>
      <p className="text-muted text-xs">
        {ROLE_OPTIONS.find((option) => option.value === role)?.label}
      </p>
      <Button type="submit" loading={invite.isPending} disabled={!email.trim()}>
        <UserPlus className="h-4 w-4" aria-hidden="true" /> Send invite
      </Button>
    </form>
  );
}

function PendingInvites({ workspaceId }) {
  const invites = useInvites(workspaceId);
  const revoke = useRevokeInvite(workspaceId);
  if (!invites.data?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Waiting to join</p>
      <ul className="border-line/60 divide-line/60 divide-y rounded-xl border">
        {invites.data.map((invite) => (
          <li key={invite.id} className="flex items-center gap-3 px-3 py-2">
            <Mail className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{invite.email}</p>
              <p className="text-muted text-xs capitalize">
                {invite.role} ·{' '}
                {invite.expired ? 'expired, invite again for a new link' : 'pending'}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Cancel invite for ${invite.email}`}
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(invite.id)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemberRow({ workspace, member, me, isAdmin }) {
  const changeRole = useChangeMemberRole(workspace.id);
  const remove = useRemoveMember(workspace.id);
  const navigate = useNavigate();
  const isMe = member.userId === me?.id;
  const isOwner = member.role === 'owner';
  const editable = isAdmin && !isMe && !isOwner;
  const error = changeRole.error ?? remove.error;

  function removeMember() {
    const prompt = isMe
      ? `Leave "${workspace.name}"? You'll lose access until someone invites you again.`
      : `Remove ${member.name} from this workspace?`;
    if (!window.confirm(prompt)) return;
    remove.mutate(member.userId, { onSuccess: () => isMe && navigate('/app', { replace: true }) });
  }

  return (
    <li className="space-y-1 px-3 py-2">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} src={member.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            {member.name} {isMe && <span className="text-muted">(you)</span>}
          </p>
          <p className="text-muted truncate text-xs">{member.email}</p>
        </div>
        {editable ? (
          <select
            aria-label={`Role for ${member.name}`}
            className="border-line bg-surface h-8 rounded-lg border px-2 text-xs"
            value={member.role}
            disabled={changeRole.isPending}
            onChange={(event) =>
              changeRole.mutate({ userId: member.userId, role: event.target.value })
            }
          >
            {SHORT_ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted text-xs capitalize">{member.role}</span>
        )}
        {(editable || (isMe && !isOwner)) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={remove.isPending}
            onClick={removeMember}
          >
            {isMe ? 'Leave' : 'Remove'}
          </Button>
        )}
      </div>
      {error && <p className="text-danger text-xs">{error.message}</p>}
    </li>
  );
}

// Settings → Members: who is in the workspace, and inviting more people.
export function MembersSection({ workspace }) {
  const { data: me } = useCurrentUser();
  const members = useMembers(workspace.id);
  const isAdmin = canAdminister(workspace);
  const { hash } = useLocation();

  // Links like Settings#members (from "Invite people") land on this card.
  useEffect(() => {
    if (hash === '#members')
      document.getElementById('members')?.scrollIntoView({ behavior: 'smooth' });
  }, [hash]);

  return (
    <Card>
      <div id="members" className="scroll-mt-24" />
      <CardHeader
        title="Members"
        description={
          isAdmin
            ? 'Invite teammates by email. They join once they sign in with that address.'
            : 'People in this workspace. Ask an owner or admin to invite someone.'
        }
      />
      <div className="space-y-5 p-5">
        {isAdmin && <InviteForm workspaceId={workspace.id} />}
        {isAdmin && <PendingInvites workspaceId={workspace.id} />}
        <div className="space-y-2">
          <p className="text-sm font-medium">In this workspace</p>
          {members.isPending ? (
            <Loader2 className="text-muted mx-auto my-4 h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <ul className="border-line/60 divide-line/60 divide-y rounded-xl border">
              {(members.data ?? []).map((member) => (
                <MemberRow
                  key={member.userId}
                  workspace={workspace}
                  member={member}
                  me={me}
                  isAdmin={isAdmin}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
