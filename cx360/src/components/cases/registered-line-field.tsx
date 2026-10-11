"use client";

/** "Is the customer using their registered line/email?" — if not, the number or email they used is typed for the record. */
export function RegisteredLineField({
  viaRegistered,
  contactUsed,
  onChange,
}: {
  viaRegistered: boolean;
  contactUsed: string;
  onChange: (v: { viaRegistered: boolean; contactUsed: string }) => void;
}) {
  return (
    <div className="text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={viaRegistered} onChange={(e) => onChange({ viaRegistered: e.target.checked, contactUsed: e.target.checked ? "" : contactUsed })} />
        Customer is using their registered line / email
      </label>
      {!viaRegistered && (
        <input
          value={contactUsed}
          onChange={(e) => onChange({ viaRegistered, contactUsed: e.target.value })}
          placeholder="Number or email they used (for the record)"
          maxLength={120}
          className="input mt-1.5 w-full text-sm"
        />
      )}
    </div>
  );
}
