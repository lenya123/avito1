"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";

// Education modules data
const EDUCATION_MODULES = [
  {
    id: "1",
    title: "Как выбрать товар",
    icon: "🎯",
    lessons: [
      {
        id: "1-1",
        title: "Анализ спроса на Avito",
        content: `Перед выбором товара важно понимать, что пользуется спросом на Avito.

**Ключевые моменты:**
• Изучайте категории с высоким спросом: одежда, обувь, аксессуары
• Обращайте внимание на сезонность товаров
• Анализируйте конкурентов и их цены

**Совет:** Начните с популярных брендов — они продаются быстрее.`,
      },
      {
        id: "1-2",
        title: "Выбор размера и модели",
        content: `Правильный выбор размера — залог быстрой продажи.

**Рекомендации:**
• Выбирайте универсальные размеры (M, L) — они продаются лучше
• Изучайте размерную сетку бренда
• Учитывайте целевую аудиторию

**Важно:** Редкие размеры (XXS, XXXL) продаются дольше.`,
      },
    ],
  },
  {
    id: "2",
    title: "Как оформить заказ",
    icon: "📦",
    lessons: [
      {
        id: "2-1",
        title: "Загрузка штрихкода",
        content: `Штрихкод — это уникальный идентификатор вашего заказа на Avito.

**Как получить:**
1. Создайте объявление на Avito
2. Когда покупатель оформит заказ, скачайте штрихкод
3. Загрузите его в нашу систему

**Важно:** Штрихкод должен быть читаемым и уникальным.`,
      },
      {
        id: "2-2",
        title: "Выбор службы доставки",
        content: `Мы работаем с основными службами доставки.

**Доступные варианты:**
• Avito Доставка — самый популярный вариант
• СДЭК — широкая сеть пунктов выдачи
• Яндекс Доставка — быстрая доставка в городе
• Почта России — для отдалённых регионов

**Совет:** Avito Доставка обычно предпочтительнее для покупателей.`,
      },
      {
        id: "2-3",
        title: "Установка дедлайна",
        content: `Дедлайн — это крайний срок отправки товара.

**Правила:**
• Устанавливайте реалистичный срок
• Учитывайте время на сборку и отправку
• Не ставьте дедлайн на выходные

**Важно:** Просроченные заказы негативно влияют на вашу репутацию.`,
      },
    ],
  },
  {
    id: "3",
    title: "Как работать с возвратами",
    icon: "↩️",
    lessons: [
      {
        id: "3-1",
        title: "Причины возвратов",
        content: `Возвраты — нормальная часть торговли.

**Основные причины:**
• Не подошёл размер
• Товар не соответствует описанию
• Покупатель передумал

**Статистика:** В среднем возвращается 5-10% заказов.`,
      },
      {
        id: "3-2",
        title: "Процесс возврата",
        content: `Когда товар возвращается, он попадает обратно на склад.

**Этапы:**
1. Покупатель инициирует возврат
2. Товар едет обратно на ПВЗ
3. Мы забираем его со склада
4. Товар снова доступен для продажи

**Важно:** Возврат не влияет на ваш депозит — товар просто возвращается в каталог.`,
      },
    ],
  },
  {
    id: "4",
    title: "Как увеличить продажи",
    icon: "📈",
    lessons: [
      {
        id: "4-1",
        title: "Правильное ценообразование",
        content: `Цена — ключевой фактор продаж.

**Рекомендации:**
• Изучите цены конкурентов
• Не занижайте слишком сильно — это вызывает подозрения
• Учитывайте все расходы при расчёте прибыли

**Формула:** Цена продажи = Закупка + Комиссия Avito + Ваша прибыль`,
      },
      {
        id: "4-2",
        title: "Качественные фото",
        content: `Фото — первое, что видит покупатель.

**Советы:**
• Используйте светлый фон
• Снимайте при хорошем освещении
• Покажите товар с разных ракурсов
• Добавьте фото замеров

**Важно:** Мы предоставляем качественные фото товаров в каталоге.`,
      },
      {
        id: "4-3",
        title: "Быстрые ответы покупателям",
        content: `Скорость ответа влияет на конверсию.

**Рекомендации:**
• Отвечайте в течение 15 минут
• Будьте вежливы и информативны
• Предоставляйте точные замеры по запросу

**Совет:** Включите уведомления на телефоне для быстрых ответов.`,
      },
    ],
  },
  {
    id: "5",
    title: "FAQ",
    icon: "❓",
    lessons: [
      {
        id: "5-1",
        title: "Как пополнить депозит?",
        content: `Депозит пополняется через наш сайт.

**Способы оплаты:**
• Банковская карта
• СБП (Система быстрых платежей)

**Минимальная сумма:** от 1000 ₽`,
      },
      {
        id: "5-2",
        title: "Как работает система уровней?",
        content: `Чем больше заказов — тем выше скидка.

**Уровни:**
• Уровень 0: 0-14 заказов — 0% скидки
• Уровень 1: 15-29 заказов — 3% скидки
• Уровень 2: 30-49 заказов — 6% скидки
• Уровень 3: 50+ заказов — 10% скидки

**Важно:** Считаются только завершённые заказы.`,
      },
      {
        id: "5-3",
        title: "Что такое +ВАЙБ?",
        content: `+ВАЙБ — статус доверенного клиента.

**Преимущества:**
• Возможность уходить в минус до 100 000 ₽
• Заказ без предоплаты
• Доступ к premium товарам

**Как получить:** Статус выдаётся владельцем по результатам работы.`,
      },
    ],
  },
];

// Accordion item component
function AccordionItem({
  module,
  isExpanded,
  onToggle,
}: {
  module: (typeof EDUCATION_MODULES)[0];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      {/* Module header */}
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between p-4",
          "text-left transition-colors",
          isExpanded ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{module.icon}</span>
          <div>
            <h3 className="text-base font-semibold text-white">{module.title}</h3>
            <p className="text-xs text-white/40 mt-0.5">
              {module.lessons.length} {module.lessons.length === 1 ? "урок" : "уроков"}
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/40"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>

      {/* Lessons */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 space-y-2">
              {module.lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className={cn(
                    "rounded-xl overflow-hidden",
                    "bg-white/[0.04] border border-glass-subtle"
                  )}
                >
                  <button
                    onClick={() =>
                      setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)
                    }
                    className={cn(
                      "w-full flex items-center justify-between p-3",
                      "text-left transition-colors",
                      expandedLesson === lesson.id ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                    )}
                  >
                    <span className="text-sm font-medium text-white/80">{lesson.title}</span>
                    <motion.div
                      animate={{ rotate: expandedLesson === lesson.id ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-white/40"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {expandedLesson === lesson.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 py-3">
                          <div className="p-3 rounded-xl bg-white/[0.03] border border-glass-subtle">
                            <div className="text-sm text-white/60 whitespace-pre-line leading-relaxed">
                              {lesson.content.split("\n").map((line, i) => {
                                if (line.startsWith("**") && line.endsWith("**")) {
                                  return (
                                    <p key={i} className="font-semibold text-white/80 mt-3 mb-1">
                                      {line.replace(/\*\*/g, "")}
                                    </p>
                                  );
                                }
                                if (line.startsWith("•")) {
                                  return (
                                    <p key={i} className="ml-2">
                                      {line}
                                    </p>
                                  );
                                }
                                return <p key={i}>{line}</p>;
                              })}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function EducationPage() {
  const [expandedModule, setExpandedModule] = useState<string | null>("1");

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Обучение</h1>
        <p className="text-sm text-white/60">Изучите материалы, чтобы успешно продавать на Avito</p>
      </motion.div>

      {/* Progress card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "relative mb-6 p-4 rounded-2xl overflow-hidden",
          "backdrop-blur-xl",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "border border-accent-blue/30",
          "shadow-card"
        )}
      >
        {/* Декоративный блик */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-blue/30 to-transparent" />
        <div className="flex items-center gap-4 relative">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br from-accent-blue/25 to-accent-blue/15",
              "border border-accent-blue/30",
              "shadow-glass-inset"
            )}
          >
            <span className="text-2xl">📚</span>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Начните обучение</h3>
            <p className="text-xs text-white/60 mt-0.5">
              {EDUCATION_MODULES.length} модулей •{" "}
              {EDUCATION_MODULES.reduce((acc, m) => acc + m.lessons.length, 0)} уроков
            </p>
          </div>
        </div>
      </motion.div>

      {/* Modules accordion */}
      <div className="space-y-3">
        {EDUCATION_MODULES.map((module, index) => (
          <motion.div
            key={module.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.03 }}
          >
            <AccordionItem
              module={module}
              isExpanded={expandedModule === module.id}
              onToggle={() => setExpandedModule(expandedModule === module.id ? null : module.id)}
            />
          </motion.div>
        ))}
      </div>

      {/* Help link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 text-center"
      >
        <p className="text-sm text-white/40">
          Не нашли ответ?{" "}
          <Link href="/support" className="text-accent-blue hover:underline">
            Напишите в поддержку
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
