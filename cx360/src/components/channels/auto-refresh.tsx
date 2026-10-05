"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page's data every `seconds` while the tab is visible, so wallboard-style screens stay live. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
