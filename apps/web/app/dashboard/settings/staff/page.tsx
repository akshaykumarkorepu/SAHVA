"use client";

import * as React from "react";
import { useApi, useMutation } from "@/lib/hooks";
import { post, patch, del } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Enums } from "@sahva/types";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";
import { formatPhone } from "@/lib/format";

type Member = {
  clinic_id: string;
  staff_id: string;
  role: Enums<"staff_role">;
  status: Enums<"member_status">;
  invited_at: string;
  joined_at: string | null;
  staff_profiles: {
    id: string;
    full_name: string;
    phone_e164: string | null;
    locale: Enums<"language_code">;
  } | null;
};

const ROLE_HELP: Record<Enums<"staff_role">, string> = {
  owner: "Everything, including billing and removing staff.",
  manager: "Everything except removing staff or adding another owner.",
  receptionist: "Day-to-day work: appointments, patients, the action queue. No settings.",
  doctor: "Same as receptionist, plus dictating consultation notes later.",
};

export default function StaffPage() {
  const { userId, role: myRole } = useSessionIds();
  const members = useApi<Member[]>("/staff");
  const [inviting, setInviting] = React.useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setInviting(true)}>Invite staff</Button>
      </div>

      {members.loading ? (
        <Spinner />
      ) : members.error ? (
        <ErrorState error={members.error} onRetry={members.reload} />
      ) : (
        <Card className="divide-y divide-ink-100">
          {(members.data ?? []).map((m) => (
            <MemberRow
              key={m.staff_id}
              member={m}
              isSelf={m.staff_id === userId}
              myRole={myRole}
              onChanged={members.reload}
            />
          ))}
        </Card>
      )}

      <div className="mt-6 rounded-xl border border-ink-100 bg-white p-5">
        <h3 className="text-sm font-semibold text-ink-900">What each role can do</h3>
        <dl className="mt-3 space-y-2 text-sm">
          {(Object.keys(ROLE_HELP) as Enums<"staff_role">[]).map((r) => (
            <div key={r} className="flex flex-wrap gap-2">
              <dt className="w-28 shrink-0 font-medium capitalize text-ink-900">{r}</dt>
              <dd className="flex-1 text-ink-500">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-500">
          These are enforced by the database, not just hidden in this app.
        </p>
      </div>

      {inviting && (
        <InviteModal
          myRole={myRole}
          onClose={() => setInviting(false)}
          onInvited={() => {
            setInviting(false);
            members.reload();
          }}
        />
      )}
    </>
  );
}

function useSessionIds() {
  const s = useSession();
  return { userId: s.session?.user.id ?? null, role: s.role };
}

function MemberRow({
  member,
  isSelf,
  myRole,
  onChanged,
}: {
  member: Member;
  isSelf: boolean;
  myRole: Enums<"staff_role"> | null;
  onChanged: () => void;
}) {
  const update = useMutation((body: { role?: string; status?: string }) =>
    patch(`/staff/${member.staff_id}`, body),
  );
  const remove = useMutation(() => del(`/staff/${member.staff_id}`));
  const canManage = myRole === "owner" || myRole === "manager";

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-ink-900">
            {member.staff_profiles?.full_name ?? "—"}
          </p>
          {isSelf && <Badge tone="info">You</Badge>}
          {member.status === "invited" && <Badge tone="warn">Invite pending</Badge>}
          {member.status === "suspended" && <Badge tone="bad">Suspended</Badge>}
        </div>
        <p className="text-xs text-ink-500">
          {formatPhone(member.staff_profiles?.phone_e164 ?? null)}
        </p>
      </div>

      {canManage && !isSelf ? (
        <Select
          value={member.role}
          className="w-40 shrink-0"
          onChange={async (e) => {
            await update.run({ role: e.target.value });
            onChanged();
          }}
        >
          <option value="receptionist">Receptionist</option>
          <option value="doctor">Doctor</option>
          <option value="manager">Manager</option>
          {myRole === "owner" && <option value="owner">Owner</option>}
        </Select>
      ) : (
        <Badge>{member.role}</Badge>
      )}

      {myRole === "owner" && !isSelf && (
        <Button
          variant="ghost"
          disabled={remove.pending}
          onClick={async () => {
            await remove.run();
            onChanged();
          }}
        >
          Remove
        </Button>
      )}

      {update.error && (
        <div className="w-full">
          <ErrorState error={update.error} />
        </div>
      )}
    </div>
  );
}

function InviteModal({
  myRole,
  onClose,
  onInvited,
}: {
  myRole: Enums<"staff_role"> | null;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<Enums<"staff_role">>("receptionist");
  const invite = useMutation(() =>
    post("/staff/invite", { email: email.trim(), full_name: name.trim(), role }),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite staff"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={invite.pending || !email.includes("@") || name.trim().length < 2}
            onClick={async () => {
              const ok = await invite.run();
              if (ok) onInvited();
            }}
          >
            {invite.pending ? "Sending…" : "Send invite"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-ink-100/60 px-3 py-2.5 text-xs text-ink-700">
          Self-signup is disabled, so this is the only way an account is created. They will get an
          email with a link to set their password.
        </p>

        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="geeta@srisaiclinic.in" />
        </Field>
        <Field label="Full name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Geeta" />
        </Field>
        <Field label="Role" hint={ROLE_HELP[role]}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Enums<"staff_role">)}>
            <option value="receptionist">Receptionist</option>
            <option value="doctor">Doctor</option>
            <option value="manager">Manager</option>
            {myRole === "owner" && <option value="owner">Owner</option>}
          </Select>
        </Field>

        {invite.error && <ErrorState error={invite.error} />}
      </div>
    </Modal>
  );
}
