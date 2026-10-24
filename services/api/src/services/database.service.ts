import { Injectable, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    this.pool = new Pool({ connectionString });
  }

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        monthly_budget_usd NUMERIC(12,2) NOT NULL DEFAULT 500,
        fail_closed BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS savings_ledger (
        id BIGSERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        model TEXT NOT NULL,
        prompt_hash TEXT NOT NULL,
        cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
        source TEXT NOT NULL,
        cost_usd NUMERIC(12,6) NOT NULL,
        baseline_cost_usd NUMERIC(12,6) NOT NULL,
        savings_usd NUMERIC(12,6) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS metadata_audit_log (
        id BIGSERIAL PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        event_type TEXT NOT NULL,
        model TEXT,
        latency_ms INT,
        pii_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }
}
