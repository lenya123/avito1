"use client";

import { createContext, useContext } from "react";

// Базовая ширина дизайна - iPhone 14 Pro Max
// Все устройства будут отображать сайт в этой ширине,
// браузер автоматически масштабирует через viewport meta tag
const BASE_WIDTH = 430;

interface ScaleContextType {
  scale: number;
  baseWidth: number;
}

const ScaleContext = createContext<ScaleContextType>({ scale: 1, baseWidth: BASE_WIDTH });

export function useViewportScale() {
  return useContext(ScaleContext);
}

export function ViewportScale({ children }: { children: React.ReactNode }) {
  // Масштабирование теперь происходит через viewport meta tag (width: 430)
  // CSS transform больше не нужен - браузер сам масштабирует страницу
  return (
    <ScaleContext.Provider value={{ scale: 1, baseWidth: BASE_WIDTH }}>
      {children}
    </ScaleContext.Provider>
  );
}
