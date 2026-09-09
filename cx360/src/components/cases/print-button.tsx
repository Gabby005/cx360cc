"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn-primary text-sm print:hidden fixed top-4 right-4 shadow-popover"
    >
      <Printer size={15} /> Print / Save as PDF
    </button>
  );
}
