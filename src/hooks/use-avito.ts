"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AvitoItem, AvitoChat, AvitoMessage } from "@/types/database";
import type { AvitoSessionStatus, AvitoWebOrder } from "@/lib/avito/types";
import { useActiveAccountIndex } from "@/stores/avito-account-store";

// --- Response Types ---

interface AvitoOverviewResponse {
  profile: { id: number | null; name: string | null } | null;
  shopName: string | null;
  stats: {
    totalItems: number;
    totalViews: number;
    totalFavorites: number;
    totalContacts: number;
    totalChats: number;
    unreadChats: number;
    rating: { score: number; total_reviews: number } | null;
    balance: { real: number; bonus: number } | null;
    // KPI по ТЗ
    adBalance: number | null;
    avgPromoPerDay: number;
    activeItems: number;
    viewsMonth: number;
    favoritesMonth: number;
    contactsMonth: number;
    ordersMonth: number;
    viewsToday: number;
    contactsToday: number;
  };
  aiAgent: {
    incoming: number;
    responses: number;
    conversion: number;
    chatsMonth: number;
    ordersMonth: number;
  };
  ordersStats: {
    totalMonth: number;
    active: number;
    successful: number;
    returnsActive: number;
    returnsCompleted: number;
  };
  activeItemIds: number[];
  activeCount: number;
  lastSyncedAt: string | null;
}

interface AvitoItemWithProduct extends AvitoItem {
  product_id: string | null;
  product_name: string | null;
  product_photo_url: string | null;
}

interface AvitoItemsResponse {
  items: AvitoItemWithProduct[];
  pagination: { page: number; per_page: number; total: number; totalPages: number };
}

interface AvitoProductOption {
  id: string;
  name: string;
  photo_urls: string[] | null;
  photo_main_index: number | null;
  drop_price: number;
}

interface AvitoChatsResponse {
  chats: AvitoChat[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface AvitoChatMessagesResponse {
  chat: AvitoChat;
  messages: AvitoMessage[];
}

interface AvitoReview {
  id: number;
  created: number; // Unix timestamp (seconds)
  text: string;
  sender: { id: number; name: string };
  score: number;
  order_id?: number;
  item?: { id: number; title: string };
  answer?: { id: number; text: string; created: number };
}

interface AvitoReviewsResponse {
  rating: { score: number; total_reviews: number } | null;
  reviews: { reviews: AvitoReview[]; total: number; limit: number; offset: number } | null;
  errors: { rating: string | null; reviews: string | null };
}

interface AvitoOperation {
  id: number;
  operation_name: string;
  datetime: string;
  amount_total: number;
  amount_bonus: number;
  amount_rub: number;
  service_name?: string;
  item_id?: number;
}

interface AvitoOperationsResponse {
  result: { operations: AvitoOperation[]; total: number };
}

interface AvitoAiAgentStatus {
  isEnabled: boolean;
  mode: string | null;
  todayStats: { incoming: number; drafts: number; approved: number; autoSent: number };
  pendingDrafts: number;
}

interface AvitoAccountInfo {
  id: string;
  accountIndex: number;
  hasCredentials: boolean;
  sessionStatus: string;
  lastSyncAt: string | null;
  errorMessage: string | null;
}

interface AvitoAccountsResponse {
  accounts: AvitoAccountInfo[];
  limit: number;
  subscriptionTier: string;
}

// --- Helper: append accountIndex to URL ---

function withAccountIndex(url: string, accountIndex: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}accountIndex=${accountIndex}`;
}

// --- Fetch functions ---

async function fetchAvitoOverview(accountIndex: number): Promise<AvitoOverviewResponse> {
  const response = await fetch(withAccountIndex("/api/avito/overview", accountIndex));
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки обзора");
  }
  return response.json();
}

async function fetchAvitoItems(
  page: number,
  perPage: number,
  accountIndex: number,
  status?: string
): Promise<AvitoItemsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
    accountIndex: accountIndex.toString(),
  });
  if (status) params.set("status", status);
  const response = await fetch(`/api/avito/items?${params}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки объявлений");
  }
  return response.json();
}

async function fetchAvitoChats(
  page: number,
  limit: number,
  accountIndex: number
): Promise<AvitoChatsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    accountIndex: accountIndex.toString(),
  });
  const response = await fetch(`/api/avito/chats?${params}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки чатов");
  }
  return response.json();
}

async function fetchChatMessages(chatId: string): Promise<AvitoChatMessagesResponse> {
  const response = await fetch(`/api/avito/chats/${chatId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки сообщений");
  }
  return response.json();
}

async function sendAvitoMessage(chatId: string, text: string) {
  const response = await fetch(`/api/avito/chats/${chatId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка отправки сообщения");
  }
  return response.json();
}

async function triggerAvitoSync(accountIndex: number) {
  const response = await fetch(withAccountIndex("/api/avito/sync", accountIndex), {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка синхронизации");
  }
  return response.json();
}

async function registerAvitoWebhook(webhookUrl: string, accountIndex: number) {
  const response = await fetch(withAccountIndex("/api/avito/webhook/register", accountIndex), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка регистрации webhook");
  }
  return response.json();
}

async function fetchAvitoAccounts(): Promise<AvitoAccountsResponse> {
  const response = await fetch("/api/avito/accounts");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки аккаунтов");
  }
  return response.json();
}

// --- Hooks ---

export function useAvitoAccounts() {
  return useQuery({
    queryKey: ["avito", "accounts"],
    queryFn: fetchAvitoAccounts,
    staleTime: 60 * 1000,
  });
}

export function useAvitoOverview() {
  const accountIndex = useActiveAccountIndex();
  return useQuery({
    queryKey: ["avito", "overview", accountIndex],
    queryFn: () => fetchAvitoOverview(accountIndex),
    staleTime: 2 * 60 * 1000,
  });
}

export function useAvitoItems(page: number = 1, perPage: number = 20, status?: string) {
  const accountIndex = useActiveAccountIndex();
  return useQuery({
    queryKey: ["avito", "items", accountIndex, page, perPage, status],
    queryFn: () => fetchAvitoItems(page, perPage, accountIndex, status),
    staleTime: 2 * 60 * 1000,
  });
}

export function useAvitoChats(page: number = 1, limit: number = 20) {
  const accountIndex = useActiveAccountIndex();
  return useQuery({
    queryKey: ["avito", "chats", accountIndex, page, limit],
    queryFn: () => fetchAvitoChats(page, limit, accountIndex),
    staleTime: 30 * 1000,
  });
}

export function useChatMessages(chatId: string | null) {
  return useQuery({
    queryKey: ["avito", "chat", chatId, "messages"],
    queryFn: () => fetchChatMessages(chatId!),
    enabled: !!chatId,
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, text }: { chatId: string; text: string }) =>
      sendAvitoMessage(chatId, text),
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ["avito", "chat", chatId] });
      queryClient.invalidateQueries({ queryKey: ["avito", "chats"] });
    },
  });
}

export function useAvitoSync() {
  const queryClient = useQueryClient();
  const accountIndex = useActiveAccountIndex();

  return useMutation({
    mutationFn: () => triggerAvitoSync(accountIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avito"] });
    },
  });
}

export function useRegisterWebhook() {
  const accountIndex = useActiveAccountIndex();
  return useMutation({
    mutationFn: (webhookUrl: string) => registerAvitoWebhook(webhookUrl, accountIndex),
  });
}

// --- Product Linking ---

async function fetchAvitoProducts(search: string): Promise<{ products: AvitoProductOption[] }> {
  const params = new URLSearchParams({ search });
  const response = await fetch(`/api/avito/products?${params}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки продуктов");
  }
  return response.json();
}

async function linkAvitoItem(avitoItemId: number, productId: string) {
  const response = await fetch("/api/avito/items/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avito_item_id: avitoItemId, product_id: productId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка привязки");
  }
  return response.json();
}

async function unlinkAvitoItem(avitoItemId: number) {
  const response = await fetch("/api/avito/items/link", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avito_item_id: avitoItemId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка отвязки");
  }
  return response.json();
}

export function useAvitoProducts(search: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["avito", "products", search],
    queryFn: () => fetchAvitoProducts(search),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useLinkAvitoItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ avitoItemId, productId }: { avitoItemId: number; productId: string }) =>
      linkAvitoItem(avitoItemId, productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avito", "items"] });
      queryClient.invalidateQueries({ queryKey: ["avito", "overview"] });
    },
  });
}

export function useUnlinkAvitoItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (avitoItemId: number) => unlinkAvitoItem(avitoItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avito", "items"] });
      queryClient.invalidateQueries({ queryKey: ["avito", "overview"] });
    },
  });
}

// --- Reviews ---

async function fetchAvitoReviews(
  offset: number,
  limit: number,
  accountIndex: number
): Promise<AvitoReviewsResponse> {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
    accountIndex: accountIndex.toString(),
  });
  const response = await fetch(`/api/avito/reviews?${params}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки отзывов");
  }
  return response.json();
}

async function replyToReview(reviewId: number, text: string, accountIndex: number) {
  const response = await fetch(withAccountIndex("/api/avito/reviews", accountIndex), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewId, text }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка отправки ответа");
  }
  return response.json();
}

async function deleteReviewAnswer(answerId: number, accountIndex: number) {
  const response = await fetch(withAccountIndex(`/api/avito/reviews/${answerId}`, accountIndex), {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка удаления ответа");
  }
  return response.json();
}

export function useAvitoReviews(offset: number = 0, limit: number = 50) {
  const accountIndex = useActiveAccountIndex();
  return useQuery({
    queryKey: ["avito", "reviews", accountIndex, offset, limit],
    queryFn: () => fetchAvitoReviews(offset, limit, accountIndex),
    staleTime: 2 * 60 * 1000,
  });
}

export function useReplyToReview() {
  const queryClient = useQueryClient();
  const accountIndex = useActiveAccountIndex();
  return useMutation({
    mutationFn: ({ reviewId, text }: { reviewId: number; text: string }) =>
      replyToReview(reviewId, text, accountIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avito", "reviews"] });
    },
  });
}

export function useDeleteReviewAnswer() {
  const queryClient = useQueryClient();
  const accountIndex = useActiveAccountIndex();
  return useMutation({
    mutationFn: (answerId: number) => deleteReviewAnswer(answerId, accountIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avito", "reviews"] });
    },
  });
}

// --- Operations ---

async function fetchAvitoOperations(
  accountIndex: number,
  from?: string,
  to?: string
): Promise<AvitoOperationsResponse> {
  const params = new URLSearchParams({ accountIndex: accountIndex.toString() });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const response = await fetch(`/api/avito/operations?${params}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки операций");
  }
  return response.json();
}

export function useAvitoOperations(from?: string, to?: string) {
  const accountIndex = useActiveAccountIndex();
  return useQuery({
    queryKey: ["avito", "operations", accountIndex, from, to],
    queryFn: () => fetchAvitoOperations(accountIndex, from, to),
    staleTime: 2 * 60 * 1000,
  });
}

// --- Price Update ---

async function updateItemPrice(itemId: number, price: number, accountIndex: number) {
  const response = await fetch(withAccountIndex(`/api/avito/items/${itemId}/price`, accountIndex), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка обновления цены");
  }
  return response.json();
}

export function useUpdateItemPrice() {
  const queryClient = useQueryClient();
  const accountIndex = useActiveAccountIndex();
  return useMutation({
    mutationFn: ({ itemId, price }: { itemId: number; price: number }) =>
      updateItemPrice(itemId, price, accountIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avito", "items"] });
      queryClient.invalidateQueries({ queryKey: ["avito", "overview"] });
    },
  });
}

// --- AI Agent Status ---

async function fetchAiAgentStatus(): Promise<AvitoAiAgentStatus> {
  const response = await fetch("/api/avito/ai-agent/status");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки статуса AI-агента");
  }
  return response.json();
}

export function useAvitoAiAgentStatus() {
  return useQuery({
    queryKey: ["avito", "ai-agent"],
    queryFn: fetchAiAgentStatus,
    staleTime: 2 * 60 * 1000,
  });
}

// --- Browser Session (Avito Orders) ---

async function fetchAvitoSession(accountIndex: number): Promise<AvitoSessionStatus> {
  const response = await fetch(withAccountIndex("/api/avito/session", accountIndex));
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки сессии");
  }
  return response.json();
}

async function fetchAvitoOrdersList(
  page: number,
  limit: number,
  accountIndex: number
): Promise<{ orders: AvitoWebOrder[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    accountIndex: accountIndex.toString(),
  });
  const response = await fetch(`/api/avito/orders?${params}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки заказов");
  }
  return response.json();
}

async function connectAvitoSession(data: {
  login: string;
  password: string;
  accountIndex?: number;
}): Promise<void> {
  const response = await fetch("/api/avito/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка подключения");
  }
}

async function disconnectAvitoSession(accountIndex: number): Promise<void> {
  const response = await fetch(withAccountIndex("/api/avito/session", accountIndex), {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка отключения");
  }
}

async function submitSmsCode(code: string, accountIndex: number): Promise<void> {
  const response = await fetch("/api/avito/session/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, accountIndex }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка отправки кода");
  }
}

export function useAvitoSession() {
  const accountIndex = useActiveAccountIndex();
  return useQuery({
    queryKey: ["avito", "session", accountIndex],
    queryFn: () => fetchAvitoSession(accountIndex),
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "awaiting_sms" ? 3000 : false;
    },
  });
}

export function useAvitoOrders(page: number = 1, limit: number = 20) {
  const accountIndex = useActiveAccountIndex();
  return useQuery({
    queryKey: ["avito", "orders", accountIndex, page, limit],
    queryFn: () => fetchAvitoOrdersList(page, limit, accountIndex),
    staleTime: 2 * 60 * 1000,
  });
}

export function useConnectAvitoSession() {
  const queryClient = useQueryClient();
  const accountIndex = useActiveAccountIndex();
  return useMutation({
    mutationFn: (data: { login: string; password: string }) =>
      connectAvitoSession({ ...data, accountIndex }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["avito", "session"] }),
  });
}

export function useDisconnectAvitoSession() {
  const queryClient = useQueryClient();
  const accountIndex = useActiveAccountIndex();
  return useMutation({
    mutationFn: () => disconnectAvitoSession(accountIndex),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["avito", "session"] }),
  });
}

export function useSubmitSmsCode() {
  const accountIndex = useActiveAccountIndex();
  return useMutation({
    mutationFn: (code: string) => submitSmsCode(code, accountIndex),
  });
}

// --- Type Exports ---

export type {
  AvitoReview,
  AvitoReviewsResponse,
  AvitoOperation,
  AvitoOperationsResponse,
  AvitoAiAgentStatus,
  AvitoSessionStatus,
  AvitoWebOrder,
  AvitoAccountInfo,
  AvitoAccountsResponse,
};
