import { redirect } from "next/navigation";

// Standalone: единственная точка входа — дашборд Avito.
// Неавторизованного пользователя middleware отправит на /auth/login.
export default function Home() {
  redirect("/avito");
}
