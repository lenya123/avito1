import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupAllReservations() {
  console.log("Cleaning up all reservations...");

  // Получаем все резервирования
  const { data: reservations, error: fetchError } = await supabase
    .from("size_reservations")
    .select("id, product_size_id");

  if (fetchError) {
    console.error("Error fetching reservations:", fetchError);
    return;
  }

  const count = reservations ? reservations.length : 0;
  console.log(`Found ${count} reservations to clean up`);

  if (!reservations || reservations.length === 0) {
    console.log("No reservations to clean up");
  } else {
    // Для каждой резервации уменьшаем reserved_quantity
    for (const reservation of reservations) {
      if (reservation.product_size_id) {
        const { data: productSize } = await supabase
          .from("product_sizes")
          .select("reserved_quantity, size, product_id")
          .eq("id", reservation.product_size_id)
          .single();

        if (productSize && (productSize.reserved_quantity || 0) > 0) {
          await supabase
            .from("product_sizes")
            .update({
              reserved_quantity: Math.max((productSize.reserved_quantity || 0) - 1, 0),
            })
            .eq("id", reservation.product_size_id);

          console.log(`Decreased reserved_quantity for size ${productSize.size}`);
        }
      }

      // Удаляем резервирование
      await supabase.from("size_reservations").delete().eq("id", reservation.id);
      console.log(`Deleted reservation ${reservation.id}`);
    }
  }

  // Также сбрасываем все reserved_quantity в 0 на всякий случай
  const { error: resetError } = await supabase
    .from("product_sizes")
    .update({ reserved_quantity: 0 })
    .gt("reserved_quantity", 0);

  if (resetError) {
    console.error("Error resetting reserved_quantity:", resetError);
  } else {
    console.log("Reset all reserved_quantity to 0");
  }

  console.log("Cleanup complete!");
}

cleanupAllReservations();
