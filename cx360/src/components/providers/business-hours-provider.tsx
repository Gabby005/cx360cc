"use client";

import { createContext, useContext } from "react";
import type { BusinessHours } from "@/lib/business-hours";

const Ctx = createContext<BusinessHours | null>(null);

/** Makes the bank's business hours available to every SLA countdown on screen. `null` = not configured (clocks run 24/7). */
export function BusinessHoursProvider({ value, children }: { value: BusinessHours | null; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBusinessHours = () => useContext(Ctx);
