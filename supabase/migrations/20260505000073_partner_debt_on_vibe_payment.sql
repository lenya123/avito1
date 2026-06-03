-- Триггер: когда +ВАЙБ-заказ получает is_paid=TRUE (= клиент погасил
-- долг и партнёр это подтвердил), записываем партнёрский комиссионный
-- долг в partner_owner_debts. Раньше эта запись создавалась при
-- confirm_pending_order_atomic — что было неправильно для +ВАЙБ
-- (партнёр в тот момент ещё ничего не получил).
--
-- Идемпотентность: проверяем что записи для этого order_id с
-- reason='partner_commission' ещё нет.

CREATE OR REPLACE FUNCTION public.write_partner_debt_on_vibe_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_paid IS TRUE
     AND (OLD.is_paid IS DISTINCT FROM TRUE)
     AND NEW.source_kind = 'partner'
     AND NEW.source_partner_id IS NOT NULL
     AND COALESCE(NEW.partner_commission_snapshot, 0) > 0
     AND NEW.payment_method = 'deposit'
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_owner_debts
       WHERE order_id = NEW.id AND reason = 'partner_commission'
    ) THEN
      INSERT INTO public.partner_owner_debts (
        partner_id, order_id, amount, reason, created_at
      ) VALUES (
        NEW.source_partner_id, NEW.id, NEW.partner_commission_snapshot,
        'partner_commission', NOW()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_debt_on_vibe_payment ON public.orders;

CREATE TRIGGER trg_partner_debt_on_vibe_payment
AFTER UPDATE OF is_paid ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.write_partner_debt_on_vibe_payment();
