"use client";

import * as React from "react";
import { useApi, useMutation } from "@/lib/hooks";
import { post, patch, del } from "@/lib/api";
import type { Tables } from "@sahva/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { rupees } from "@/lib/format";

type Faq = Tables<"clinic_faqs">;
type Service = Tables<"clinic_services">;

const CATEGORIES = [
  "fees",
  "timings",
  "location",
  "services",
  "doctors",
  "insurance",
  "preparation",
  "other",
] as const;

export default function KnowledgePage() {
  const faqs = useApi<Faq[]>("/knowledge/faqs");
  const services = useApi<Service[]>("/knowledge/services");
  const [editingFaq, setEditingFaq] = React.useState<Faq | null>(null);
  const [newFaq, setNewFaq] = React.useState(false);
  const [editingService, setEditingService] = React.useState<Service | null>(null);
  const [newService, setNewService] = React.useState(false);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
        <p className="font-medium">This is the only thing the AI may say beyond the schedule.</p>
        <p className="mt-1 text-sky-800">
          Anything a caller asks that is not answered here gets escalated rather than improvised.
          Nothing is shared between clinics.
        </p>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Questions &amp; answers</h3>
            <p className="text-xs text-ink-500">Write the Telugu answer too — most callers use it.</p>
          </div>
          <Button onClick={() => setNewFaq(true)}>Add question</Button>
        </div>

        {faqs.loading ? (
          <Spinner />
        ) : faqs.error ? (
          <ErrorState error={faqs.error} onRetry={faqs.reload} />
        ) : (faqs.data ?? []).length === 0 ? (
          <EmptyState
            icon="?"
            title="No answers configured"
            body="Until you add these, the AI can only handle scheduling."
          />
        ) : (
          <div className="divide-y divide-ink-100">
            {(faqs.data ?? []).map((f) => (
              <div key={f.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink-900">{f.question_en}</p>
                    <Badge>{f.category}</Badge>
                    {!f.is_active && <Badge tone="neutral">Off</Badge>}
                    {!f.answer_te && <Badge tone="warn">No Telugu</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-500">{f.answer_en}</p>
                </div>
                <Button variant="ghost" onClick={() => setEditingFaq(f)}>
                  Edit
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Services and prices</h3>
            <p className="text-xs text-ink-500">What the AI quotes when asked what you offer.</p>
          </div>
          <Button onClick={() => setNewService(true)}>Add service</Button>
        </div>

        {services.loading ? (
          <Spinner />
        ) : (services.data ?? []).length === 0 ? (
          <EmptyState icon="₹" title="No services listed" />
        ) : (
          <div className="divide-y divide-ink-100">
            {(services.data ?? []).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {s.name_en}
                    {s.name_te && <span className="ml-2 text-ink-500">{s.name_te}</span>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {rupees(s.price_paise)}
                    {s.duration_min ? ` · ${s.duration_min} min` : ""}
                    {s.category ? ` · ${s.category}` : ""}
                  </p>
                </div>
                {!s.is_active && <Badge tone="neutral">Off</Badge>}
                <Button variant="ghost" onClick={() => setEditingService(s)}>
                  Edit
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {(newFaq || editingFaq) && (
        <FaqModal
          faq={editingFaq}
          onClose={() => {
            setNewFaq(false);
            setEditingFaq(null);
          }}
          onSaved={() => {
            setNewFaq(false);
            setEditingFaq(null);
            faqs.reload();
          }}
        />
      )}

      {(newService || editingService) && (
        <ServiceModal
          service={editingService}
          onClose={() => {
            setNewService(false);
            setEditingService(null);
          }}
          onSaved={() => {
            setNewService(false);
            setEditingService(null);
            services.reload();
          }}
        />
      )}
    </div>
  );
}

function FaqModal({
  faq,
  onClose,
  onSaved,
}: {
  faq: Faq | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = React.useState({
    question_en: faq?.question_en ?? "",
    question_te: faq?.question_te ?? "",
    answer_en: faq?.answer_en ?? "",
    answer_te: faq?.answer_te ?? "",
    category: faq?.category ?? "other",
    keywords: (faq?.keywords ?? []).join(", "),
    priority: faq?.priority ?? 0,
    is_active: faq?.is_active ?? true,
  });

  const save = useMutation(() => {
    const payload = {
      question_en: f.question_en.trim(),
      question_te: f.question_te.trim() || undefined,
      answer_en: f.answer_en.trim(),
      answer_te: f.answer_te.trim() || undefined,
      category: f.category,
      keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      priority: f.priority,
      is_active: f.is_active,
    };
    return faq ? patch(`/knowledge/faqs/${faq.id}`, payload) : post("/knowledge/faqs", payload);
  });
  const remove = useMutation(() => del(`/knowledge/faqs/${faq!.id}`));

  return (
    <Modal
      open
      onClose={onClose}
      title={faq ? "Edit question" : "Add question"}
      footer={
        <>
          {faq && (
            <Button
              variant="ghost"
              disabled={remove.pending}
              onClick={async () => {
                await remove.run();
                onSaved();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.pending || !f.question_en.trim() || !f.answer_en.trim()}
            onClick={async () => {
              const ok = await save.run();
              if (ok) onSaved();
            }}
          >
            {save.pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Question (English)" required>
          <Input value={f.question_en} onChange={(e) => setF({ ...f, question_en: e.target.value })} placeholder="What are the consultation fees?" />
        </Field>
        <Field label="Question (Telugu)">
          <Input value={f.question_te} onChange={(e) => setF({ ...f, question_te: e.target.value })} placeholder="సంప్రదింపు ఫీజు ఎంత?" />
        </Field>
        <Field label="Answer (English)" required>
          <Textarea rows={3} value={f.answer_en} onChange={(e) => setF({ ...f, answer_en: e.target.value })} />
        </Field>
        <Field
          label="Answer (Telugu)"
          hint="Without this, Telugu callers hear the English answer."
        >
          <Textarea rows={3} value={f.answer_te} onChange={(e) => setF({ ...f, answer_te: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as typeof f.category })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" hint="Higher shows first.">
            <Input type="number" min={0} max={100} value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })} />
          </Field>
        </div>
        <Field
          label="Keywords"
          hint="Comma separated. Telugu retrieval falls back to these, so include Telugu words too."
        >
          <Input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="fee, fees, ఫీజు, ఖర్చు" />
        </Field>
        {save.error && <ErrorState error={save.error} />}
      </div>
    </Modal>
  );
}

function ServiceModal({
  service,
  onClose,
  onSaved,
}: {
  service: Service | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = React.useState({
    name_en: service?.name_en ?? "",
    name_te: service?.name_te ?? "",
    price_rupees: service?.price_paise ? service.price_paise / 100 : 0,
    duration_min: service?.duration_min ?? 15,
    category: service?.category ?? "",
    is_active: service?.is_active ?? true,
  });

  const save = useMutation(() => {
    const payload = {
      name_en: f.name_en.trim(),
      name_te: f.name_te.trim() || undefined,
      price_paise: Math.round(f.price_rupees * 100),
      duration_min: f.duration_min,
      category: f.category.trim() || undefined,
      is_active: f.is_active,
    };
    return service
      ? patch(`/knowledge/services/${service.id}`, payload)
      : post("/knowledge/services", payload);
  });
  const remove = useMutation(() => del(`/knowledge/services/${service!.id}`));

  return (
    <Modal
      open
      onClose={onClose}
      title={service ? "Edit service" : "Add service"}
      footer={
        <>
          {service && (
            <Button
              variant="ghost"
              disabled={remove.pending}
              onClick={async () => {
                await remove.run();
                onSaved();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.pending || !f.name_en.trim()}
            onClick={async () => {
              const ok = await save.run();
              if (ok) onSaved();
            }}
          >
            {save.pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name (English)" required>
          <Input value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} placeholder="Child vaccination" />
        </Field>
        <Field label="Name (Telugu)">
          <Input value={f.name_te} onChange={(e) => setF({ ...f, name_te: e.target.value })} placeholder="పిల్లల టీకా" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price ₹">
            <Input type="number" min={0} value={f.price_rupees} onChange={(e) => setF({ ...f, price_rupees: Number(e.target.value) })} />
          </Field>
          <Field label="Duration (min)">
            <Input type="number" min={5} max={240} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) })} />
          </Field>
          <Field label="Category">
            <Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="paediatrics" />
          </Field>
        </div>
        {save.error && <ErrorState error={save.error} />}
      </div>
    </Modal>
  );
}
