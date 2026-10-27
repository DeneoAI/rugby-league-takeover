import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Ticket, MessageSquare, Percent, Calendar, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import MembershipCard from "@/components/membership/MembershipCard";
import {
  isActiveMember, formatMembershipDate, membershipStatusLine, MEMBERSHIP_TERM_MONTHS, liveDiscounts,
} from "@/lib/membership";

// Fixed perks of being a member. The discounts themselves are admin-managed
// (Admin → Store → Member Discounts) and listed above these.
const BENEFITS = [
  { icon: ShieldCheck, title: "RLT Member badge", text: "Your posts carry the member badge across the forum." },
  { icon: Ticket, title: "Member events", text: "First access to member-only events and ticket releases." },
  { icon: MessageSquare, title: "Backing the club", text: "Every membership goes straight back into the takeover." },
];

export default function MembershipTab() {
  const { user } = useAuth();
  const active = isActiveMember(user);
  const { data: discountRows = [] } = useQuery({
    queryKey: ["membershipDiscounts"],
    queryFn: () => base44.entities.MembershipDiscount.list("sort_order", 100),
    retry: false,
    meta: { silent: true },
  });
  const discounts = useMemo(() => liveDiscounts(discountRows), [discountRows]);

  return (
    <div className="grid gap-5">
      <MembershipCard />

      <div className="border border-border/50 bg-card/20 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-display text-base uppercase tracking-wide text-foreground">Your membership</h3>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="border border-border/30 bg-black/20 p-3">
            <dt className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Status</dt>
            <dd className={`mt-1 text-sm font-bold ${active ? "text-emerald-400" : "text-slate-400"}`}>
              {active ? "Active" : "Inactive"}
            </dd>
          </div>
          <div className="border border-border/30 bg-black/20 p-3">
            <dt className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Member since</dt>
            <dd className="mt-1 text-sm font-bold text-foreground">
              {formatMembershipDate(user?.membership_started_at)}
            </dd>
          </div>
          <div className="border border-border/30 bg-black/20 p-3">
            <dt className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Renews / expires</dt>
            <dd className="mt-1 text-sm font-bold text-foreground">
              {formatMembershipDate(user?.membership_expires_at)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="mt-px h-3 w-3 shrink-0 text-primary/70" />
          {membershipStatusLine(user)} · Memberships run for {MEMBERSHIP_TERM_MONTHS} months from
          purchase. Renewing early adds a full term to the end of your current one, so you never
          lose time you've paid for.
        </p>
      </div>

      <div className="border border-border/50 bg-card/20 p-5">
        <h3 className="font-display text-base uppercase tracking-wide text-foreground">What you get</h3>
        {discounts.length > 0 && (
          <ul className="mt-4 grid gap-3">
            {discounts.map((discount) => (
              <li key={discount.id} className="flex items-start gap-3 border border-primary/30 bg-primary/5 p-3">
                <Percent className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-foreground">{discount.title}</p>
                    {discount.discount_label && (
                      <span className="border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                        {discount.discount_label}
                      </span>
                    )}
                  </div>
                  {discount.description && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{discount.description}</p>
                  )}
                  {discount.venue && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                      <MapPin className="h-3 w-3 shrink-0" /> {discount.venue}
                    </p>
                  )}
                  {discount.how_to_redeem && (
                    <p className="mt-1 text-[10px] text-slate-500">{discount.how_to_redeem}</p>
                  )}
                  {discount.ends_at && (
                    <p className="mt-1 text-[10px] text-amber-300/80">Until {formatMembershipDate(discount.ends_at)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="flex items-start gap-3 border border-border/20 bg-black/20 p-3">
              <benefit.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">{benefit.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{benefit.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
