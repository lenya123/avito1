"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, Button, Input, Spinner } from "@/components/ui";
import {
  useAvitoSession,
  useConnectAvitoSession,
  useDisconnectAvitoSession,
  useSubmitSmsCode,
} from "@/hooks/use-avito";

const connectSchema = z.object({
  login: z.string().min(1, "Введите логин или телефон"),
  password: z.string().min(1, "Введите пароль"),
});

const smsSchema = z.object({
  code: z.string().min(4, "Код слишком короткий").max(8, "Код слишком длинный"),
});

type ConnectForm = z.infer<typeof connectSchema>;
type SmsForm = z.infer<typeof smsSchema>;

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "";
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} д назад`;
}

export function AvitoSessionConnect() {
  const { data: session, isLoading } = useAvitoSession();
  const connectMutation = useConnectAvitoSession();
  const disconnectMutation = useDisconnectAvitoSession();
  const submitSmsMutation = useSubmitSmsCode();
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ConnectForm>({ resolver: zodResolver(connectSchema) });

  const {
    register: registerSms,
    handleSubmit: handleSubmitSms,
    formState: { errors: smsErrors },
    reset: resetSms,
  } = useForm<SmsForm>({ resolver: zodResolver(smsSchema) });

  const onSubmit = async (data: ConnectForm) => {
    await connectMutation.mutateAsync(data);
    reset();
    setShowForm(false);
  };

  const onSmsSubmit = async (data: SmsForm) => {
    await submitSmsMutation.mutateAsync(data.code);
    resetSms();
  };

  if (isLoading) {
    return (
      <Card className="p-4 flex items-center justify-center h-20">
        <Spinner size="sm" />
      </Card>
    );
  }

  const status = session?.status;

  // Ожидаем SMS код от пользователя
  if (status === "awaiting_sms") {
    return (
      <Card padding="sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
            <span className="text-accent-blue text-sm font-bold">SMS</span>
          </div>
          <div>
            <p className="text-sm font-medium text-white/80">Введите код из SMS</p>
            <p className="text-xs text-white/40">Avito отправил код на ваш номер</p>
          </div>
        </div>
        <form onSubmit={handleSubmitSms(onSmsSubmit)} className="space-y-3">
          <Input
            placeholder="Код из SMS"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            {...registerSms("code")}
            error={smsErrors.code?.message}
          />
          <Button
            type="submit"
            variant="primary"
            isLoading={submitSmsMutation.isPending}
            className="w-full"
          >
            Подтвердить
          </Button>
        </form>
        {submitSmsMutation.isError && (
          <p className="text-xs text-accent-red mt-2">{submitSmsMutation.error?.message}</p>
        )}
      </Card>
    );
  }

  // Подключаемся (pending) — только если реально есть логин/пароль
  if (status === "pending" && session?.hasLogin) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <div>
            <p className="text-sm font-medium text-white/80">Подключаемся...</p>
            <p className="text-xs text-white/40">Входим в аккаунт Авито</p>
          </div>
        </div>
      </Card>
    );
  }

  // Активно — показываем статус подключения
  if (status === "active" && session?.hasLogin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = session as any;
    const proxyHost = s.proxyHost || null;
    const avitoLogin = s.avitoLogin || null;

    return (
      <Card padding="sm">
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <p className="text-sm font-semibold text-white">Avito подключён</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => disconnectMutation.mutate()}
            isLoading={disconnectMutation.isPending}
          >
            Отключить
          </Button>
        </div>

        {/* Детали */}
        <div className="grid grid-cols-2 gap-2">
          {avitoLogin && (
            <div className="p-2.5 rounded-xl bg-white/[0.04] border border-glass">
              <p className="text-2xs text-white/40 mb-0.5">Аккаунт</p>
              <p className="text-xs font-medium text-white/80 truncate">{avitoLogin}</p>
            </div>
          )}
          {proxyHost && (
            <div className="p-2.5 rounded-xl bg-white/[0.04] border border-glass">
              <p className="text-2xs text-white/40 mb-0.5">Прокси</p>
              <p className="text-xs font-mono text-white/80 truncate">{proxyHost}</p>
            </div>
          )}
          {session?.lastSyncAt && (
            <div className="p-2.5 rounded-xl bg-white/[0.04] border border-glass">
              <p className="text-2xs text-white/40 mb-0.5">Последний синк</p>
              <p className="text-xs font-medium text-white/80">{formatRelativeTime(session.lastSyncAt)}</p>
            </div>
          )}
          {session?.lastLoginAt && (
            <div className="p-2.5 rounded-xl bg-white/[0.04] border border-glass">
              <p className="text-2xs text-white/40 mb-0.5">Вход в Avito</p>
              <p className="text-xs font-medium text-white/80">{formatRelativeTime(session.lastLoginAt)}</p>
            </div>
          )}
        </div>

        <p className="text-2xs text-white/20 mt-2 flex items-center gap-1">
          Данные обновляются автоматически каждые 15-30 мин
        </p>
      </Card>
    );
  }

  // Ошибка / истекла
  if (status === "error" || status === "expired") {
    return (
      <Card padding="sm">
        <div className="mb-3">
          <p className="text-sm font-medium text-accent-red">Ошибка подключения</p>
          {session?.errorMessage && (
            <p className="text-xs text-white/40 mt-0.5">{session.errorMessage}</p>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          Повторить
        </Button>
        {showForm && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-3">
            <Input
              placeholder="Логин / телефон"
              {...register("login")}
              error={errors.login?.message}
            />
            <Input
              type="password"
              placeholder="Пароль"
              {...register("password")}
              error={errors.password?.message}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={connectMutation.isPending}
              className="w-full"
            >
              Войти
            </Button>
          </form>
        )}
        {connectMutation.isError && (
          <p className="text-xs text-accent-red mt-2">{connectMutation.error?.message}</p>
        )}
      </Card>
    );
  }

  // Не подключено
  return (
    <Card padding="sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📦</span>
        <p className="text-sm font-medium text-white/80">Подключить заказы Авито</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2.5">
          <Input
            placeholder="Логин / телефон"
            {...register("login")}
            error={errors.login?.message}
          />
          <Input
            type="password"
            placeholder="Пароль"
            {...register("password")}
            error={errors.password?.message}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          isLoading={connectMutation.isPending}
          className="w-full mt-3"
        >
          Подключить
        </Button>
      </form>

      {connectMutation.isError && (
        <p className="text-xs text-accent-red mt-2">{connectMutation.error?.message}</p>
      )}

      <p className="text-xs text-white/40 flex items-center gap-1 mt-2">
        <span>🔒</span> Данные хранятся зашифрованно
      </p>
    </Card>
  );
}
