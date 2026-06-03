import { useQuery } from "@tanstack/react-query";

export interface ShipperEarnings {
  balance: number;
  payouts: never[];
}

export function useShipperEarnings() {
  return useQuery<ShipperEarnings>({
    queryKey: ["shipper-earnings"],
    queryFn: async () => ({ balance: 0, payouts: [] }),
    enabled: false,
  });
}
