"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/types";
import { api } from "@/lib/client-api";

interface Payload {
  conv: Conversation | null;
  statuses: Record<string, string>;
}

export function useConversation(phone: string) {
  const [data, setData] = useState<Payload>({ conv: null, statuses: {} });
  const phoneRef = useRef(phone);

  useEffect(() => {
    phoneRef.current = phone;
  }, [phone]);

  const refresh = useCallback(async () => {
    const p = phoneRef.current;
    if (p.replace(/\D/g, "").length < 10) {
      setData({ conv: null, statuses: {} });
      return;
    }
    try {
      const next = await api<Payload>(`/api/conversation?phone=${encodeURIComponent(p)}`);
      if (phoneRef.current === p) setData(next);
    } catch {
      /* transient polling error */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [phone, refresh]);

  const reset = useCallback(async () => {
    await api(`/api/conversation?phone=${encodeURIComponent(phoneRef.current)}`, { method: "DELETE" });
    setData({ conv: null, statuses: {} });
  }, []);

  return { ...data, refresh, reset };
}
