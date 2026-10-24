import { Controller, Get, Param } from "@nestjs/common";
import { DatabaseService } from "../services/database.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly db: DatabaseService) {}

  @Get("summary/:tenantId")
  async summary(@Param("tenantId") tenantId: string) {
    const spend = await this.db.queryOne<{
      total_spend_usd: string;
      total_savings_usd: string;
      requests_count: string;
      cache_hits: string;
    }>(
      `
      SELECT
        COALESCE(SUM(cost_usd), 0)::text as total_spend_usd,
        COALESCE(SUM(savings_usd), 0)::text as total_savings_usd,
        COUNT(*)::text as requests_count,
        COUNT(*) FILTER (WHERE cache_hit = true)::text as cache_hits
      FROM savings_ledger
      WHERE tenant_id = $1
      `,
      [tenantId],
    );
    return spend ?? {
      total_spend_usd: "0",
      total_savings_usd: "0",
      requests_count: "0",
      cache_hits: "0",
    };
  }
}
