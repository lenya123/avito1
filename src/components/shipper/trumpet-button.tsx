"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui";
import { toast } from "sonner";

interface TrumpetState {
  active: boolean;
  triggeredAt?: string | null;
}

/**
 * Кнопка «Протрубить возвраты» (BUSINESS_LOGIC §6.4).
 * Один тромбон/день на весь магазин (single-tenant).
 * Если активен — показывает «Отменить trumpet».
 */
export function TrumpetButton({ disabled }: { disabled?: boolean }) {
  const [state, setState] = useState<TrumpetState | null>(null);
  const [isLoading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/shipper/trumpet");
      if (!res.ok) return;
      const data = await res.json();
      setState({ active: data.active, triggeredAt: data.session?.triggered_at });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleTrumpet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shipper/trumpet", { method: "POST" });
      if (res.status === 409) {
        toast.error("Сегодня уже трубили");
      } else if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Не удалось протрубить");
      } else {
        const j = await res.json();
        toast.success(`Trumpet активирован (${j.customersCount} клиентов уведомлены)`);
        await refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const handleCancel = useCallback(async () => {
    if (!confirm("Отменить trumpet? Все запланированные DM-уведомления клиентам будут сняты.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/shipper/trumpet", { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Не удалось отменить");
      } else {
        toast.success("Trumpet отменён");
        await refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  if (!state) return null;

  if (state.active) {
    return (
      <Button
        variant="secondary"
        className="w-full"
        onClick={handleCancel}
        disabled={disabled || isLoading}
      >
        ✖ Отменить trumpet (использован сегодня)
      </Button>
    );
  }

  return (
    <Button
      variant="primary"
      className="w-full"
      onClick={handleTrumpet}
      disabled={disabled || isLoading}
      isLoading={isLoading}
    >
      📢 Протрубить возвраты
    </Button>
  );
}
