import { useQuery } from "@tanstack/react-query";

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
}

interface NotificationsResponse {
  items: ActivityItem[];
  total: number;
  recentCount: number;
}

async function fetchNotifications(limit = 20): Promise<NotificationsResponse> {
  const response = await fetch(`/api/owner/notifications?limit=${limit}`);
  if (!response.ok) throw new Error("Ошибка загрузки уведомлений");
  return response.json();
}

export function useOwnerNotifications(limit = 20) {
  return useQuery({
    queryKey: ["owner", "notifications", limit],
    queryFn: () => fetchNotifications(limit),
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

// Human-readable action descriptions
const ACTION_LABELS: Record<string, string> = {
  order_created: "Новый заказ",
  order_status_changed: "Статус заказа изменён",
  order_cancelled: "Заказ отменён",
  order_assigned: "Шиппер назначен",
  order_tracking_updated: "Трек-номер обновлён",
  order_comment_updated: "Комментарий обновлён",
  order_completed: "Заказ доставлен",
  order_batch_cancel: "Массовая отмена",
  order_batch_status: "Массовая смена статуса",
  product_created: "Товар создан",
  product_updated: "Товар обновлён",
  product_deleted: "Товар удалён",
  client_blocked: "Клиент заблокирован",
  client_unblocked: "Клиент разблокирован",
  client_vibe_plus_toggled: "ВАЙБ+ изменён",
  client_deposit_limit_updated: "Лимит депозита изменён",
  shipper_created: "Шиппер создан",
  shipper_updated: "Шиппер обновлён",
  shipper_deleted: "Шиппер удалён",
  settings_updated: "Настройки обновлены",
};

const ACTION_ICONS: Record<string, string> = {
  order_created: "📦",
  order_status_changed: "🔄",
  order_cancelled: "❌",
  order_assigned: "👤",
  order_tracking_updated: "🔍",
  order_completed: "✅",
  order_batch_cancel: "🗑",
  product_created: "➕",
  product_updated: "✏️",
  product_deleted: "🗑",
  client_blocked: "🚫",
  client_unblocked: "✅",
  client_vibe_plus_toggled: "⚡",
  shipper_created: "➕",
  settings_updated: "⚙️",
};

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

export function getActionIcon(action: string): string {
  return ACTION_ICONS[action] || "📋";
}

export function getActionColor(action: string): string {
  if (action.includes("cancel") || action.includes("delete") || action.includes("block")) {
    return "text-accent-red";
  }
  if (action.includes("created") || action.includes("completed") || action.includes("unblock")) {
    return "text-accent-green";
  }
  if (action.includes("updated") || action.includes("changed") || action.includes("assigned")) {
    return "text-accent-blue";
  }
  return "text-white/60";
}
