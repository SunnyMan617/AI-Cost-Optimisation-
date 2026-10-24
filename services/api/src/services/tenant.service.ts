import { Injectable } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { TenantRow } from "../types";

@Injectable()
export class TenantService {
  constructor(private readonly db: DatabaseService) {}

  async upsertTenant(input: {
    id: string;
    name: string;
    monthlyBudgetUsd?: number;
    failClosed?: boolean;
  }) {
    const defaultBudget = Number(process.env.DEFAULT_MONTHLY_BUDGET_USD || 500);
    const defaultFailClosed = (process.env.FAIL_CLOSED_DEFAULT || "true") === "true";
    const tenant = await this.db.queryOne<TenantRow>(
      `
      INSERT INTO tenants (id, name, monthly_budget_usd, fail_closed, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        monthly_budget_usd = EXCLUDED.monthly_budget_usd,
        fail_closed = EXCLUDED.fail_closed,
        updated_at = NOW()
      RETURNING id, name, monthly_budget_usd, fail_closed
      `,
      [
        input.id,
        input.name,
        input.monthlyBudgetUsd ?? defaultBudget,
        input.failClosed ?? defaultFailClosed,
      ],
    );
    return tenant;
  }

  async getTenant(id: string) {
    return this.db.queryOne<TenantRow>(
      "SELECT id, name, monthly_budget_usd, fail_closed FROM tenants WHERE id = $1",
      [id],
    );
  }

  async ensureTenant(id: string): Promise<TenantRow> {
    const existing = await this.getTenant(id);
    if (existing) {
      return existing;
    }
    return (await this.upsertTenant({
      id,
      name: `Tenant ${id}`,
    })) as TenantRow;
  }
}
