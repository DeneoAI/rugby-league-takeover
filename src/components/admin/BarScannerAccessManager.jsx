import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, RefreshCw, ScanLine, Save, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { normaliseBarCode, isBarAccessCode } from "@/lib/barScanner";

// The 8-digit code bar staff enter on /scan to check member cards. Stored
// server-side only (bar_scanner_access, migration 0040) and read through the
// membershipCard function, which checks the admin role itself.

const QUERY_KEY = ["barScannerAccess"];

const formatCode = (code) => (code ? `${code.slice(0, 4)} ${code.slice(4)}` : "Not set");

export default function BarScannerAccessManager() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await base44.functions.invoke("membershipCard", { action: "bar_settings" })).data,
    retry: false,
  });

  useEffect(() => { setDraft(data?.code || ""); }, [data?.code]);

  const save = useMutation({
    mutationFn: async (patch) =>
      (await base44.functions.invoke("membershipCard", { action: "bar_settings_save", ...patch })).data,
    onSuccess: (next, patch) => {
      queryClient.setQueryData(QUERY_KEY, next);
      toast({
        title: patch.enabled === false ? "Bar scanner switched off" : "Bar scanner updated",
        description: patch.code !== undefined || patch.generate
          ? "Bar devices using the old code are signed out. Give bars the new code."
          : undefined,
      });
    },
    onError: (err) => toast({ title: "Couldn't save", description: err?.message, variant: "destructive" }),
  });

  const scanUrl = `${window.location.origin}/scan`;
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${what} copied` });
    } catch {
      toast({ title: "Couldn't copy", description: text });
    }
  };

  if (error) {
    return (
      <div className="border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">
        Couldn't load the bar scanner settings: {error.message}
      </div>
    );
  }

  const code = data?.code || "";
  const enabled = !!data?.enabled;
  const dirty = draft !== code;

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="border border-border/60 bg-card/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg uppercase tracking-wide">
              <ScanLine className="h-4 w-4 text-accent" /> Bar scanner access
            </h3>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
              Bar staff open <span className="font-mono text-foreground">/scan</span> on any phone, enter this
              8-digit code, then scan members' cards to see if their membership is valid and what perks they get.
              They don't need an RLT account. Changing the code signs every bar device out.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {enabled ? "On" : "Off"}
            </span>
            <Switch
              checked={enabled}
              disabled={isLoading || save.isPending || (!enabled && !code)}
              onCheckedChange={(value) => save.mutate({ enabled: value })}
              aria-label="Bar scanner on or off"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="border border-accent/40 bg-black/40 px-5 py-3 font-mono text-3xl tracking-[0.25em] text-foreground">
            {isLoading ? "…" : formatCode(code)}
          </div>
          {code && (
            <Button type="button" variant="outline" size="sm" onClick={() => copy(code, "Code")}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy code
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate({ generate: true, enabled: true })}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {code ? "New random code" : "Generate code"}
          </Button>
        </div>

        {!enabled && code && (
          <p className="mt-3 text-xs text-amber-300">The scanner is off. Bars can't sign in until you turn it back on.</p>
        )}

        <form
          className="mt-5 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (isBarAccessCode(draft)) save.mutate({ code: draft, enabled: true });
          }}
        >
          <label className="grid grid-cols-1 gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Or set your own code</span>
            <Input
              value={draft}
              onChange={(e) => setDraft(normaliseBarCode(e.target.value))}
              inputMode="numeric"
              maxLength={8}
              placeholder="8 digits"
              className="w-40 font-mono tracking-[0.2em]"
            />
          </label>
          <Button type="submit" size="sm" disabled={!dirty || !isBarAccessCode(draft) || save.isPending}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save code
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-3 border border-border/40 bg-card/20 p-4 text-xs text-muted-foreground">
        <KeyRound className="h-4 w-4 text-accent" />
        <span>Scanner link for bars:</span>
        <span className="font-mono text-foreground">{scanUrl}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => copy(scanUrl, "Link")}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
        </Button>
        <a href="/scan" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-accent hover:underline">
          Open <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
