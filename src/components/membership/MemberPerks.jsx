import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent, MapPin, Gift } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatMembershipDate, liveDiscounts } from "@/lib/membership";

// The perks that come with an RLT membership, as set by the admin in
// Admin → Store → Member Perks (table membership_discounts, migration 0038).
// Perks apply to every member: there is one membership tier.
export function useMemberPerks() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["membershipDiscounts"],
    queryFn: () => base44.entities.MembershipDiscount.list("sort_order", 100),
    retry: false,
    meta: { silent: true },
  });
  // Admins can read hidden rows too, so filter to what members see right now.
  const perks = useMemo(() => liveDiscounts(rows), [rows]);
  return { perks, isLoading };
}

export function PerkList({ perks }) {
  return (
    <ul className="grid gap-3">
      {perks.map((perk) => (
        <li key={perk.id} className="flex items-start gap-3 border border-primary/30 bg-primary/5 p-3">
          <Percent className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold text-foreground">{perk.title}</p>
              {perk.discount_label && (
                <span className="border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                  {perk.discount_label}
                </span>
              )}
            </div>
            {perk.description && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{perk.description}</p>
            )}
            {perk.venue && (
              <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                <MapPin className="h-3 w-3 shrink-0" /> {perk.venue}
              </p>
            )}
            {perk.how_to_redeem && (
              <p className="mt-1 text-[10px] text-slate-500">{perk.how_to_redeem}</p>
            )}
            {perk.ends_at && (
              <p className="mt-1 text-[10px] text-amber-300/80">Until {formatMembershipDate(perk.ends_at)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// Shown directly under an active member's card.
export default function MemberPerks() {
  const { perks } = useMemberPerks();
  if (perks.length === 0) return null;
  return (
    <div className="border border-border/50 bg-card/20 p-4">
      <h3 className="flex items-center gap-2 font-display text-sm uppercase tracking-wide text-foreground">
        <Gift className="h-4 w-4 text-primary" /> Your member perks
      </h3>
      <div className="mt-3">
        <PerkList perks={perks} />
      </div>
    </div>
  );
}
