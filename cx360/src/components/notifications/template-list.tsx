"use client";

import { useState } from "react";
import { ChevronDown, Mail, MessageSquare } from "lucide-react";
import { GROUP_LABEL, type TemplateDef, type TemplateGroup } from "@/lib/notification-templates";
import { TemplateEditor, type TemplateState } from "@/components/notifications/template-editor";

type Item = { def: TemplateDef; state: TemplateState };

export function TemplateList({ items, bankName }: { items: Item[]; bankName: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups: TemplateGroup[] = ["customer", "department", "sla"];

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const rows = items.filter((i) => i.def.group === g);
        return (
          <section key={g}>
            <h2 className="text-sm font-semibold">{GROUP_LABEL[g].title}</h2>
            <p className="text-xs text-ink-950/50 dark:text-surface/50 mb-2">{GROUP_LABEL[g].blurb}</p>
            <div className="card divide-y divide-line-light dark:divide-line-dark">
              {rows.map(({ def, state }) => {
                const isOpen = open === def.key;
                const Icon = def.channel === "email" ? Mail : MessageSquare;
                return (
                  <div key={def.key}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : def.key)} className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-surface/60 dark:hover:bg-ink-800/60">
                      <div className="flex items-start gap-3 min-w-0">
                        <Icon size={16} className="mt-0.5 shrink-0 text-ink-950/40 dark:text-surface/40" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{def.label}</div>
                          <div className="text-xs text-ink-950/50 dark:text-surface/50">{def.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!def.alwaysOn && !state.enabled && <span className="pill-neutral">Off</span>}
                        {state.isCustom && <span className="pill-brand">Edited</span>}
                        <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-5 pt-1 border-t border-line-light dark:border-line-dark">
                        <div className="pt-4">
                          <TemplateEditor def={def} initial={state} bankName={bankName} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
