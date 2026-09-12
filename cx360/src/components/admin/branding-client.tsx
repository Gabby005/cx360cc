"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check } from "lucide-react";
import { BRAND_PRESETS, isValidHexColor } from "@/lib/theme";

const MAX_LOGO_BYTES = 500 * 1024; // 500KB — generous for a logo, keeps the base64 stored on the Tenant row reasonable

export function BrandingClient({ initialLogo, initialColor }: { initialLogo: string | null; initialColor: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState(initialLogo);
  const [color, setColor] = useState(initialColor);
  const [customHex, setCustomHex] = useState(initialColor);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`That image is ${Math.round(file.size / 1024)}KB — please use one under 500KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function save() {
    setError(null);
    if (!isValidHexColor(color)) {
      setError("Enter a valid hex color, e.g. #5B5FEF.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/tenant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandColor: color, logoDataUrl: logo }),
    });
    setSaving(false);

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to save" }));
      setError(msg);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-3">Logo</h2>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg border border-line-light dark:border-line-dark grid place-items-center overflow-hidden bg-surface dark:bg-ink-800 shrink-0">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo preview" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-ink-950/40 dark:text-surface/40">No logo</span>
            )}
          </div>
          <div className="flex-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <button onClick={() => fileRef.current?.click()} className="btn-secondary text-xs">
              <Upload size={13} /> Upload image
            </button>
            {logo && (
              <button onClick={() => setLogo(null)} className="btn-ghost text-xs ml-2 text-sla-breach">
                Remove
              </button>
            )}
            <p className="text-[11px] text-ink-950/50 dark:text-surface/50 mt-2">
              Under 500KB. Square images work best (it's shown at 32×32 in the sidebar).
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-3">Brand color</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.hex}
              onClick={() => {
                setColor(p.hex);
                setCustomHex(p.hex);
              }}
              title={p.name}
              className="w-9 h-9 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: p.hex,
                borderColor: color.toLowerCase() === p.hex.toLowerCase() ? p.hex : "transparent",
                boxShadow: color.toLowerCase() === p.hex.toLowerCase() ? "0 0 0 2px white, 0 0 0 4px " + p.hex : "none",
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 max-w-xs">
          <input
            type="color"
            value={isValidHexColor(customHex) ? customHex : "#5B5FEF"}
            onChange={(e) => {
              setCustomHex(e.target.value);
              setColor(e.target.value);
            }}
            className="w-10 h-10 rounded border border-line-light dark:border-line-dark cursor-pointer bg-transparent"
          />
          <input
            value={customHex}
            onChange={(e) => {
              setCustomHex(e.target.value);
              if (isValidHexColor(e.target.value)) setColor(e.target.value);
            }}
            className="input font-mono"
            placeholder="#5B5FEF"
          />
        </div>
      </div>

      {error && <p className="text-sm text-sla-breach">{error}</p>}

      <button onClick={save} disabled={saving} className="btn-primary">
        {saved ? (
          <>
            <Check size={15} /> Saved
          </>
        ) : saving ? (
          "Saving…"
        ) : (
          "Save branding"
        )}
      </button>
    </div>
  );
}
