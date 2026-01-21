import React, { useMemo } from "react";
import { QUOTES } from "../data/quotes";

function fmtDateKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function QuoteOfTheDay({ isDark, border, surface, textMuted }) {
  const dayKey = fmtDateKey();

  const quote = useMemo(() => {
    if (!QUOTES.length) return null;
    const storageKey = `quoteOfDay:${dayKey}`;
    if (typeof window !== "undefined") {
      const storedId = window.localStorage.getItem(storageKey);
      if (storedId) {
        const found = QUOTES.find((q) => q.id === storedId);
        if (found) return found;
      }
    }
    const idx = hashString(dayKey) % QUOTES.length;
    const picked = QUOTES[idx];
    if (typeof window !== "undefined" && picked?.id) {
      window.localStorage.setItem(storageKey, picked.id);
    }
    return picked;
  }, [dayKey]);

  if (!quote) return null;

  return (
    <div className={["rounded-2xl border p-4", border, surface].filter(Boolean).join(" ")}>
      <div className="text-lg font-extrabold">Quote of the Day</div>
      <div
        className={[
          "mt-3 rounded-2xl border p-4",
          border,
          isDark ? "bg-zinc-950/10" : "bg-white",
        ].join(" ")}
      >
        <div className={["text-base font-semibold italic leading-relaxed", isDark ? "text-zinc-50" : "text-zinc-900"].join(" ")}>
          {quote.text}
        </div>
        <div className={["mt-2 text-sm font-semibold", textMuted].join(" ")}>
          — {quote.author}
          {quote.source ? `, ${quote.source}` : ""}
        </div>
      </div>
    </div>
  );
}
