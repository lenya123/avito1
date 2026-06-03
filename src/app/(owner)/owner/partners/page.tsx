"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button, Card, CardContent, CardHeader, Modal, Input, Skeleton } from "@/components/ui";

interface PartnerListItem {
  id: string;
  name: string;
  tgUsername: string | null;
  tgUserId: number | null;
  inviteToken: string;
  isActive: boolean;
  isLinked: boolean;
  productCount: number;
  partnerOwesOwner: number;
  createdAt: string;
}

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

export default function OwnerPartnersPage() {
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [tgUsername, setTgUsername] = useState("");
  const [warehouseCity, setWarehouseCity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/partners", { credentials: "include" });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const body = (await res.json()) as { partners: PartnerListItem[] };
      setPartners(body.partners);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleCreate = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/owner/partners", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tgUsername: tgUsername.trim() || undefined,
          warehouseCity: warehouseCity.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Ошибка");
      }
      setCreateOpen(false);
      setName("");
      setTgUsername("");
      setWarehouseCity("");
      setNotes("");
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvite = async (token: string) => {
    const botUsername = process.env.NEXT_PUBLIC_PARTNER_BOT_USERNAME || "your_partner_bot";
    const link = `https://t.me/${botUsername}?start=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      alert("Ссылка-приглашение скопирована!");
    } catch {
      prompt("Скопируйте ссылку:", link);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Партнёры</h1>
          <p className="text-sm text-white/60">
            Поставщики чужих товаров — сами отправляют клиенту, возвращают вам комиссию.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + Добавить партнёра
        </Button>
      </div>

      {loading && <Skeleton className="h-32 rounded-xl" />}

      {!loading && partners.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-white/60">
            Партнёров пока нет. Добавьте первого — бот сгенерирует ссылку-приглашение.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {partners.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/owner/partners/${p.id}`}
                    className="text-lg font-semibold text-white hover:text-accent-blue"
                  >
                    {p.name}
                  </Link>
                  {!p.isActive && (
                    <span className="px-2 py-0.5 text-xs rounded bg-white/10 text-white/60">
                      Отключён
                    </span>
                  )}
                  {!p.isLinked && (
                    <span className="px-2 py-0.5 text-xs rounded bg-orange-500/20 text-accent-orange border border-orange-500/25">
                      Не привязан
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/60">
                  {p.tgUsername ? `@${p.tgUsername}` : "без @username"}
                  {" · "}
                  Товаров: {p.productCount}
                </p>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-xs text-white/40">Долг по комиссии</p>
                  <p
                    className={`text-lg font-bold ${
                      p.partnerOwesOwner > 0 ? "text-accent-orange" : "text-accent-green"
                    }`}
                  >
                    {formatRub(p.partnerOwesOwner)}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => copyInvite(p.inviteToken)}>
                📋 Скопировать приглашение
              </Button>
              <Link href={`/owner/partners/${p.id}`}>
                <Button variant="ghost" size="sm">
                  Детали
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Добавить партнёра">
        <div className="space-y-4">
          <Input
            label="Имя партнёра"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Лена"
            required
          />
          <Input
            label="Telegram @username (без @)"
            value={tgUsername}
            onChange={(e) => setTgUsername(e.target.value)}
            placeholder="lena_supplier"
          />
          <Input
            label="Город склада"
            value={warehouseCity}
            onChange={(e) => setWarehouseCity(e.target.value)}
            placeholder="Калининград"
            required
          />
          <Input
            label="Заметка (необязательно)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Джинсы и футболки"
          />
          {error && <p className="text-sm text-accent-red">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={submitting || !name.trim() || !warehouseCity.trim()}
            >
              {submitting ? "Создаём…" : "Создать"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
