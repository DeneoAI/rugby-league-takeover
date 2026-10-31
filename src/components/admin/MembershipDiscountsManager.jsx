import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, BadgePercent, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { sortDiscounts, discountStatus } from "@/lib/membership";

// What an RLT membership includes. These rows drive the "What you get" list on
// Account → Membership and the discount list staff see after scanning a valid
// member card, so an edit here is live for both the moment it saves.

const emptyDraft = {
  title: "",
  discount_label: "",
  description: "",
  venue: "",
  how_to_redeem: "Show your member QR code when you order.",
  sort_order: 1,
  is_active: true,
  starts_at: "",
  ends_at: "",
};

const STATUS_STYLES = {
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  scheduled: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  ended: "border-border/50 bg-muted/20 text-muted-foreground",
  hidden: "border-border/50 bg-muted/20 text-muted-foreground",
};

// <input type="datetime-local"> speaks local wall-clock time with no zone.
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

function windowError(startsAt, endsAt) {
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return "The end time must be after the start time.";
  }
  return "";
}

export default function MembershipDiscountsManager() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyDraft);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ["membershipDiscounts"],
    queryFn: () => base44.entities.MembershipDiscount.list("sort_order", 200),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["membershipDiscounts"] });
  const onError = (err) => toast({ title: "Couldn't save", description: err?.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: () => {
      const title = draft.title.trim();
      if (!title) throw new Error("Give the perk a name.");
      const startsAt = fromLocalInput(draft.starts_at);
      const endsAt = fromLocalInput(draft.ends_at);
      const problem = windowError(startsAt, endsAt);
      if (problem) throw new Error(problem);
      return base44.entities.MembershipDiscount.create({
        title,
        discount_label: draft.discount_label.trim() || null,
        description: draft.description.trim() || null,
        venue: draft.venue.trim() || null,
        how_to_redeem: draft.how_to_redeem.trim() || null,
        sort_order: Number(draft.sort_order) || 1,
        is_active: draft.is_active !== false,
        starts_at: startsAt,
        ends_at: endsAt,
      });
    },
    onSuccess: () => { refresh(); setDraft(emptyDraft); toast({ title: "Discount added" }); },
    onError,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MembershipDiscount.update(id, data),
    onSuccess: refresh,
    onError: (err) => { refresh(); onError(err); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MembershipDiscount.delete(id),
    onSuccess: () => { refresh(); toast({ title: "Perk removed" }); },
    onError,
  });

  const sorted = useMemo(() => sortDiscounts(discounts), [discounts]);
  const liveCount = sorted.filter((d) => discountStatus(d) === "live").length;

  // Inline edits save on blur, like the FAQ manager. Blank optional text is
  // stored as NULL so the member view doesn't render empty lines.
  const saveText = (discount, field, value) => {
    const next = value.trim();
    if (field === "title" && !next) {
      toast({ title: "A perk needs a name", variant: "destructive" });
      return;
    }
    if ((discount[field] || "") === next) return;
    updateMutation.mutate({ id: discount.id, data: { [field]: next || null } });
  };
  const saveWindow = (discount, field, value) => {
    const iso = fromLocalInput(value);
    const startsAt = field === "starts_at" ? iso : discount.starts_at;
    const endsAt = field === "ends_at" ? iso : discount.ends_at;
    const problem = windowError(startsAt, endsAt);
    if (problem) { toast({ title: problem, variant: "destructive" }); return; }
    if ((discount[field] || null) === iso) return;
    updateMutation.mutate({ id: discount.id, data: { [field]: iso } });
  };

  return (
    <section id="membership-discounts-admin" className="scroll-mt-28 border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 font-display text-3xl uppercase">
        <BadgePercent className="h-6 w-6 text-primary" /> Member Perks
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The perks and discounts that come with every RLT membership. Members see the live ones under their
        member card in My Account, and bar staff see them after scanning a valid card on /scan.{" "}
        <span className="font-bold text-foreground">{liveCount} live now.</span>
      </p>

      <div className="mt-5 grid gap-3 border border-border bg-background/40 p-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Plus className="h-4 w-4" /> Add a perk
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px]">
          <Input aria-label="Perk name" placeholder="Name (e.g. Bar discounts)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="h-11 rounded-none" />
          <Input aria-label="Headline value" placeholder="Value (e.g. 10% off)" value={draft.discount_label} onChange={(e) => setDraft({ ...draft, discount_label: e.target.value })} className="h-11 rounded-none" />
        </div>
        <Textarea aria-label="Details" placeholder="Details members will see (what's included, any limits)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="min-h-20 rounded-none" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input aria-label="Where" placeholder="Where (optional, e.g. a partner bar)" value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} className="h-11 rounded-none" />
          <Input aria-label="How to redeem" placeholder="How to redeem" value={draft.how_to_redeem} onChange={(e) => setDraft({ ...draft, how_to_redeem: e.target.value })} className="h-11 rounded-none" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid grid-cols-1 gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Starts (optional)</span>
            <Input type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} className="h-11 rounded-none" />
          </label>
          <label className="grid grid-cols-1 gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Ends (optional)</span>
            <Input type="datetime-local" value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} className="h-11 rounded-none" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Input type="number" aria-label="Sort order" placeholder="Sort order" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} className="h-11 w-32 rounded-none" />
          <label className="flex min-h-11 items-center gap-2 text-sm">Visible to members <Switch checked={draft.is_active !== false} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} /></label>
          <Button size="mobile" onClick={() => createMutation.mutate()} disabled={!draft.title.trim() || createMutation.isPending} className="ml-auto w-full rounded-none bg-primary hover:bg-primary/90 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Add perk
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          This list is public so it can sell the membership. Don't put secret promo codes in it.
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading discounts…</p>}
        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No discounts yet. Add the first thing members get above.</p>
        )}
        {sorted.map((discount) => {
          const status = discountStatus(discount);
          return (
            <div key={`${discount.id}-${discount.updated_date || ""}`} className="grid grid-cols-1 gap-3 border border-border p-4">
              <div className="flex items-center gap-2">
                <span className={`border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLES[status]}`}>{status}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px_100px]">
                <Input aria-label="Perk name" defaultValue={discount.title || ""} onBlur={(e) => saveText(discount, "title", e.target.value)} className="h-11 rounded-none" />
                <Input aria-label="Headline value" placeholder="Value (e.g. 10% off)" defaultValue={discount.discount_label || ""} onBlur={(e) => saveText(discount, "discount_label", e.target.value)} className="h-11 rounded-none" />
                <Input aria-label="Sort order" type="number" defaultValue={discount.sort_order ?? 1} onBlur={(e) => updateMutation.mutate({ id: discount.id, data: { sort_order: Number(e.target.value) || 1 } })} className="h-11 rounded-none" />
              </div>
              <Textarea aria-label="Details" placeholder="Details" defaultValue={discount.description || ""} onBlur={(e) => saveText(discount, "description", e.target.value)} className="min-h-20 rounded-none" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input aria-label="Where" placeholder="Where (optional)" defaultValue={discount.venue || ""} onBlur={(e) => saveText(discount, "venue", e.target.value)} className="h-11 rounded-none" />
                <Input aria-label="How to redeem" placeholder="How to redeem" defaultValue={discount.how_to_redeem || ""} onBlur={(e) => saveText(discount, "how_to_redeem", e.target.value)} className="h-11 rounded-none" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="grid grid-cols-1 gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Starts</span>
                  <Input type="datetime-local" defaultValue={toLocalInput(discount.starts_at)} onBlur={(e) => saveWindow(discount, "starts_at", e.target.value)} className="h-11 rounded-none" />
                </label>
                <label className="grid grid-cols-1 gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Ends</span>
                  <Input type="datetime-local" defaultValue={toLocalInput(discount.ends_at)} onBlur={(e) => saveWindow(discount, "ends_at", e.target.value)} className="h-11 rounded-none" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3">
                <label className="flex min-h-11 items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Visible to members <Switch checked={discount.is_active !== false} onCheckedChange={(v) => updateMutation.mutate({ id: discount.id, data: { is_active: v } })} />
                </label>
                {confirmDeleteId === discount.id ? (
                  <div className="ml-auto flex flex-wrap items-center gap-2 border border-destructive/60 bg-destructive/10 px-3 py-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="text-xs font-bold text-destructive">Delete this perk?</span>
                    <Button variant="destructive" size="sm" className="h-8 rounded-none" onClick={() => { deleteMutation.mutate(discount.id); setConfirmDeleteId(null); }}>Yes, delete</Button>
                    <Button variant="outline" size="sm" className="h-8 rounded-none" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <Button variant="destructive" size="mobile" className="ml-auto rounded-none" onClick={() => setConfirmDeleteId(discount.id)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
