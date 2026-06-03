"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import Image from "next/image";

export interface BarcodeUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export function BarcodeUpload({
  value,
  onChange,
  onError,
  disabled = false,
  className,
}: BarcodeUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      // Валидация типа файла
      if (!file.type.startsWith("image/")) {
        onError?.("Поддерживаются только изображения");
        return;
      }

      // Валидация размера (максимум 5MB)
      if (file.size > 5 * 1024 * 1024) {
        onError?.("Максимальный размер файла: 5MB");
        return;
      }

      setIsUploading(true);

      try {
        // Создаём preview
        const preview = URL.createObjectURL(file);
        setPreviewUrl(preview);

        // Загружаем на сервер (заглушка — в реальности нужен API)
        // В продакшене здесь будет загрузка в Supabase Storage
        const formData = new FormData();
        formData.append("file", file);

        // Временно используем base64 для демонстрации
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          onChange(base64);
          setIsUploading(false);
        };
        reader.onerror = () => {
          onError?.("Ошибка чтения файла");
          setIsUploading(false);
          setPreviewUrl(null);
        };
        reader.readAsDataURL(file);
      } catch {
        onError?.("Ошибка загрузки файла");
        setIsUploading(false);
        setPreviewUrl(null);
      }
    },
    [onChange, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [disabled, handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setPreviewUrl(null);
      onChange(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onChange]
  );

  return (
    <div className={cn("space-y-2", className)}>
      <motion.div
        role="button"
        tabIndex={0}
        aria-label="Загрузить фото"
        whileTap={{ scale: disabled ? 1 : 0.99 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        className={cn(
          "relative w-full min-h-[10rem] rounded-xl",
          "border-2 border-dashed",
          "flex flex-col items-center justify-center gap-3",
          "transition-all duration-300 cursor-pointer",
          "overflow-hidden",
          isDragging
            ? [
                "border-accent-blue/50 bg-accent-blue/10",
                "shadow-[inset_0_0_30px_rgba(10,132,255,0.1)]",
              ]
            : previewUrl
              ? "border-accent-green/30 bg-accent-green/5"
              : [
                  "border-glass-subtle bg-white/[0.03]",
                  "hover:border-white/[0.2] hover:bg-white/[0.05]",
                ],
          disabled && "opacity-50 cursor-not-allowed",
          isUploading && "pointer-events-none"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
        />

        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 border-2 border-accent-blue/30 rounded-full" />
                <div className="absolute inset-0 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-sm text-white/60 font-medium">Загрузка...</span>
            </motion.div>
          ) : previewUrl ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full h-full min-h-[10rem] p-3"
            >
              {/* Success indicator */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-green/20 border border-accent-green/30"
              >
                <svg
                  className="w-3.5 h-3.5 text-accent-green"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-2xs font-semibold text-accent-green uppercase tracking-wide">
                  Загружено
                </span>
              </motion.div>

              {/* Preview container */}
              <div
                className={cn(
                  "relative w-full h-36 rounded-xl overflow-hidden",
                  "bg-white shadow-lg",
                  "ring-1 ring-white/20"
                )}
              >
                <Image src={previewUrl} alt="Штрихкод" fill className="object-contain p-2" />
              </div>

              {/* Remove button */}
              {!disabled && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  onClick={handleRemove}
                  className={cn(
                    "absolute top-3 right-3 z-10",
                    "w-8 h-8 rounded-full",
                    "bg-accent-red/90 hover:bg-accent-red",
                    "flex items-center justify-center",
                    "transition-all duration-200",
                    "shadow-lg shadow-accent-red/25",
                    "ring-2 ring-black/20"
                  )}
                >
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </motion.button>
              )}

              {/* Change hint */}
              <p className="mt-3 text-center text-xs text-white/40">Нажмите, чтобы заменить</p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 p-6"
            >
              {/* Upload icon */}
              <motion.div
                animate={{ y: isDragging ? -5 : 0 }}
                transition={{ type: "spring", stiffness: 300 }}
                className={cn(
                  "w-14 h-14 rounded-xl",
                  "bg-white/[0.06] border border-glass-minimal",
                  "flex items-center justify-center",
                  "shadow-glass-inset",
                  isDragging && "bg-accent-blue/20 border-accent-blue/30"
                )}
              >
                <svg
                  className={cn(
                    "w-7 h-7 transition-colors",
                    isDragging ? "text-accent-blue" : "text-white/40"
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </motion.div>

              {/* Text */}
              <div className="text-center space-y-1.5">
                <p className="text-sm text-white/80">
                  {isDragging ? (
                    <span className="text-accent-blue font-medium">Отпустите для загрузки</span>
                  ) : (
                    <>
                      Нажмите, чтобы{" "}
                      <span className="text-accent-blue font-medium">прикрепить фото</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-white/20">PNG, JPG до 5MB</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Help text */}
      <p className="text-xs text-white/20 leading-relaxed">
        Скачайте штрихкод из личного кабинета Avito и загрузите его сюда
      </p>
    </div>
  );
}
