import { apiCall } from "@/lib/_core/api";
import type { SignatureStroke } from "@/components/signature-pad";

export type StockOutPayload = {
  equipment: {
    code: string;
    name: string;
  };
  quantity: number;
  requester: {
    name: string;
    registration?: string;
    department?: string;
  };
  signature: {
    strokes: SignatureStroke[];
  };
  capturedAt: string;
};

export type StockOutResponse = {
  ok: true;
  externalId?: string;
  message?: string;
};

export async function submitStockOut(payload: StockOutPayload) {
  return apiCall<StockOutResponse>("/api/inventory/stock-out", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
