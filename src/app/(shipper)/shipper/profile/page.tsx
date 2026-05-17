"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, CardContent } from "@/components/ui";
import { cn } from "@/utils/cn";
import { useShipperAuthStore, useShipperUser } from "@/stores/shipper-auth-store";
import { PrinterSettingsSection } from "@/components/shipper/printer-settings-section";
import { GuideSection } from "@/components/shipper/guide-section";
import { Z_HEADER } from "@/components/shipper/constants";
import packageJson from "../../../../../package.json";

export default function ShipperProfilePage() {
  const router = useRouter();
  const user = useShipperUser();
  const { logout } = useShipperAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/shipper/login");
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header
        className={`sticky top-0 md:top-16 ${Z_HEADER} bg-primary backdrop-blur-xl border-b border-glass`}
      >
        <div className="max-w-4xl mx-auto px-4 py-3">
          <h1 className="text-xl font-bold text-white">Профиль</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Профиль */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center",
                    "bg-gradient-to-br from-accent-blue/20 to-accent-blue/10",
                    "border border-accent-blue/25",
                    "shadow-[0_0_12px_rgba(10,132,255,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
                  )}
                >
                  <span className="text-xl font-bold text-accent-blue">
                    {user?.name?.[0]?.toUpperCase() || "О"}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-white">{user?.name || "Отправщик"}</p>
                  {user?.telegramUsername && (
                    <p className="text-sm text-white/50">@{user.telegramUsername}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Принтер */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="text-sm font-medium text-white/60 mb-3 px-1">Принтер</h2>
          <PrinterSettingsSection />
        </motion.section>

        {/* Руководство */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-sm font-medium text-white/60 mb-3 px-1">Руководство</h2>
          <GuideSection />
        </motion.section>

        {/* Версия */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-center"
        >
          <p className="text-xs text-white/25">Версия {packageJson.version}</p>
        </motion.div>

        {/* Выход */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Button variant="danger" size="lg" className="w-full" onClick={handleLogout}>
            Выйти из аккаунта
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
