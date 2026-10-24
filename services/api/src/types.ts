export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatRequestDto = {
  tenantId: string;
  model: string;
  canWait?: boolean;
  messages: ChatMessage[];
};

export type TenantRow = {
  id: string;
  name: string;
  monthly_budget_usd: number;
  fail_closed: boolean;
};
