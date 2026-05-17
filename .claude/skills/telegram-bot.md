# Telegram Bot Pattern

Паттерн создания Telegram ботов на Grammy.

## Структура бота

```typescript
import { Bot, Context, session, SessionFlavor } from "grammy";
import { KEYBOARDS, createDynamicKeyboard } from "../utils/keyboards";
import { formatPrice, formatDate } from "../utils/formatters";
import { findUserByTelegramId, createUser } from "../db";

// 1. Типы сессии
interface SessionData {
  step: string;
  data: Record<string, unknown>;
}

type MyContext = Context & SessionFlavor<SessionData>;

// 2. Создание бота
const bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN!);

// 3. Middleware сессии
bot.use(session({
  initial: (): SessionData => ({
    step: "idle",
    data: {},
  }),
}));

// 4. Команда /start
bot.command("start", async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  // Проверка/создание пользователя
  let user = await findUserByTelegramId(telegramId);
  if (!user) {
    user = await createUser({
      telegram_id: telegramId,
      telegram_username: ctx.from?.username,
    });
  }

  await ctx.reply(
    "Добро пожаловать!",
    { reply_markup: KEYBOARDS.main }
  );
});

// 5. Обработка callback_query
bot.callbackQuery(/^action:(.+)$/, async (ctx) => {
  const actionId = ctx.match[1];
  await ctx.answerCallbackQuery();

  // Логика...
  await ctx.editMessageText("Обновлённый текст");
});

// 6. Обработка текстовых сообщений
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  if (ctx.session.step === "waiting_input") {
    // Обработка ввода
    ctx.session.step = "idle";
    await ctx.reply("Принято!");
  }
});

export { bot };
```

## Утилиты

### keyboards.ts

```typescript
import { InlineKeyboard, Keyboard } from "grammy";

export const KEYBOARDS = {
  main: new Keyboard()
    .text("Каталог").text("Заказы").row()
    .text("Профиль")
    .resized(),

  confirm: new InlineKeyboard()
    .text("Да", "confirm:yes")
    .text("Нет", "confirm:no"),
};

export function createOrderKeyboard(orderId: string) {
  return new InlineKeyboard()
    .text("Подробнее", `order:${orderId}`)
    .text("Отменить", `cancel:${orderId}`);
}
```

### formatters.ts

```typescript
export function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("ru-RU");
}
```

## Правила

1. **Grammy** — используем Grammy, не node-telegram-bot-api
2. **Сессии** — для многошаговых диалогов
3. **Callback regex** — `/^prefix:(.+)$/` для извлечения ID
4. **answerCallbackQuery()** — всегда вызывай после callback
5. **Клавиатуры** — отдельный файл keyboards.ts

## Файлы ботов

```
src/lib/telegram/
├── bots/
│   ├── client-bot.ts    # Бот для клиентов
│   ├── owner-bot.ts     # Бот для владельца
│   └── shipper-bot.ts   # Бот для отправщиков
├── utils/
│   ├── keyboards.ts     # Клавиатуры
│   └── formatters.ts    # Форматтеры
├── db.ts                # Функции работы с БД
└── notifications.ts     # Отправка уведомлений
```

## Отправка уведомлений

```typescript
import { sendNotification } from "@/lib/telegram/notifications";

await sendNotification(telegramId, {
  type: "order_shipped",
  orderId: order.id,
  trackingNumber: trackingNumber,
});
```
