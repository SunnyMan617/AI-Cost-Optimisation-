import { HttpService } from "@nestjs/axios";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { firstValueFrom } from "rxjs";
import { CacheService } from "./cache.service";
import { DatabaseService } from "./database.service";
import { TenantService } from "./tenant.service";
import { ChatRequestDto } from "../types";

type MaskResponse = {
  masked_text: string;
  mappings: Record<string, string>;
  entities: Array<{ entity_type: string; value: string }>;
};

@Injectable()
export class AiService {
  private readonly pricing: Record<string, { input: number; output: number; baselineFactor: number }> = {
    "openai-gpt-4o-mini": { input: 0.00000015, output: 0.0000006, baselineFactor: 1.25 },
    "anthropic-claude-3-5-haiku": { input: 0.00000025, output: 0.00000125, baselineFactor: 1.35 },
    "gemini-1-5-flash": { input: 0.0000001, output: 0.0000004, baselineFactor: 1.2 },
  };

  constructor(
    private readonly http: HttpService,
    private readonly cache: CacheService,
    private readonly db: DatabaseService,
    private readonly tenants: TenantService,
  ) {}

  async processChat(body: ChatRequestDto) {
    const startedAt = Date.now();
    const tenant = await this.tenants.ensureTenant(body.tenantId);
    const prompt = body.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const masked = await this.maskPrompt(prompt);
    const hash = createHash("sha256").update(`${tenant.id}:${body.model}:${masked.masked_text}`).digest("hex");
    const normalized = masked.masked_text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const semanticHash = createHash("sha256").update(`${tenant.id}:${body.model}:${normalized}`).digest("hex");
    const cacheKey = `tenant:${tenant.id}:exact:${hash}`;
    const semanticCacheKey = `tenant:${tenant.id}:semantic:${semanticHash}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const restored = await this.restoreText(cached, masked.mappings);
      await this.recordLedger(tenant.id, body.model, hash, true, "exact_cache", 0, 0, masked.entities, Date.now() - startedAt);
      return {
        id: `cache-${hash.slice(0, 12)}`,
        model: body.model,
        cached: true,
        choices: [{ message: { role: "assistant", content: restored } }],
      };
    }

    const semanticCached = await this.cache.get(semanticCacheKey);
    if (semanticCached) {
      const restored = await this.restoreText(semanticCached, masked.mappings);
      await this.recordLedger(tenant.id, body.model, hash, true, "semantic_cache", 0, 0, masked.entities, Date.now() - startedAt);
      return {
        id: `semantic-${semanticHash.slice(0, 12)}`,
        model: body.model,
        cached: true,
        choices: [{ message: { role: "assistant", content: restored } }],
      };
    }

    await this.enforceRunawayGuard(tenant.id);
    await this.enforceBudget(tenant.id, Number(tenant.monthly_budget_usd));

    let providerContent = "";
    try {
      providerContent = await this.callLiteLLM(body.model, body.messages, masked.masked_text);
    } catch (error) {
      const fallback = await this.tryDirectFallback(body.model, masked.masked_text, tenant.fail_closed);
      providerContent = fallback;
    }

    const restored = await this.restoreText(providerContent, masked.mappings);
    const approxInputTokens = Math.ceil(masked.masked_text.length / 4);
    const approxOutputTokens = Math.ceil(providerContent.length / 4);
    const { actualCost, baselineCost } = this.calculateCost(body.model, approxInputTokens, approxOutputTokens, !!body.canWait);
    const savings = Math.max(baselineCost - actualCost, 0);

    await this.cache.set(cacheKey, providerContent, 3600);
    await this.cache.set(semanticCacheKey, providerContent, 7200);
    await this.recordLedger(
      tenant.id,
      body.model,
      hash,
      false,
      body.canWait ? "batch_autopilot" : "live_call",
      actualCost,
      baselineCost,
      masked.entities,
      Date.now() - startedAt,
    );

    return {
      id: `live-${hash.slice(0, 12)}`,
      model: body.model,
      cached: false,
      usage: { prompt_tokens: approxInputTokens, completion_tokens: approxOutputTokens },
      savings_usd: savings,
      choices: [{ message: { role: "assistant", content: restored } }],
    };
  }

  private async maskPrompt(prompt: string): Promise<MaskResponse> {
    const privacyUrl = process.env.PRIVACY_URL || "http://localhost:8000";
    const response = await firstValueFrom(this.http.post<MaskResponse>(`${privacyUrl}/mask`, { text: prompt }));
    return response.data;
  }

  private async restoreText(text: string, mappings: Record<string, string>): Promise<string> {
    const privacyUrl = process.env.PRIVACY_URL || "http://localhost:8000";
    const response = await firstValueFrom(
      this.http.post<{ restored_text: string }>(`${privacyUrl}/restore`, { text, mappings }),
    );
    return response.data.restored_text;
  }

  private async callLiteLLM(model: string, messages: Array<{ role: string; content: string }>, maskedPrompt: string) {
    const litellmUrl = process.env.LITELLM_URL || "http://localhost:4000";
    const response = await firstValueFrom(
      this.http.post(
        `${litellmUrl}/chat/completions`,
        {
          model,
          messages: [{ role: "user", content: maskedPrompt }],
          metadata: {
            gateway_mode: "mvp",
            original_message_count: messages.length,
          },
        },
        {
          headers: { Authorization: `Bearer ${process.env.LITELLM_MASTER_KEY}` },
          timeout: 15000,
        },
      ),
    );
    return response.data?.choices?.[0]?.message?.content ?? "";
  }

  private async tryDirectFallback(model: string, maskedPrompt: string, failClosed: boolean): Promise<string> {
    if (failClosed) {
      throw new HttpException("Gateway unavailable and tenant policy is fail-closed", HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (model !== "openai-gpt-4o-mini") {
      throw new HttpException("Fallback demo currently supports openai-gpt-4o-mini only", HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new HttpException("OPENAI_API_KEY missing for fallback call", HttpStatus.SERVICE_UNAVAILABLE);
    }

    const response = await firstValueFrom(
      this.http.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: maskedPrompt }],
        },
        {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          timeout: 15000,
        },
      ),
    );
    return response.data?.choices?.[0]?.message?.content ?? "";
  }

  private async enforceBudget(tenantId: string, monthlyBudgetUsd: number): Promise<void> {
    const current = await this.db.queryOne<{ month_spend: string }>(
      `
      SELECT COALESCE(SUM(cost_usd), 0)::text as month_spend
      FROM savings_ledger
      WHERE tenant_id = $1
      AND created_at >= date_trunc('month', NOW())
      `,
      [tenantId],
    );
    const spend = Number(current?.month_spend ?? "0");
    if (spend >= monthlyBudgetUsd) {
      throw new HttpException("Monthly budget exceeded", HttpStatus.PAYMENT_REQUIRED);
    }
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number, canWait: boolean) {
    const selected = this.pricing[model] ?? this.pricing["openai-gpt-4o-mini"];
    const rawCost = inputTokens * selected.input + outputTokens * selected.output;
    const actualCost = canWait ? rawCost * 0.8 : rawCost;
    const baselineCost = actualCost * selected.baselineFactor;
    return { actualCost, baselineCost };
  }

  private async enforceRunawayGuard(tenantId: string): Promise<void> {
    const spikes = await this.db.queryOne<{ req_count: string }>(
      `
      SELECT COUNT(*)::text as req_count
      FROM metadata_audit_log
      WHERE tenant_id = $1
      AND created_at >= NOW() - INTERVAL '5 minutes'
      `,
      [tenantId],
    );
    const reqCount = Number(spikes?.req_count ?? "0");
    if (reqCount > 120) {
      throw new HttpException("Runaway Agent Guard: request spike detected", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async recordLedger(
    tenantId: string,
    model: string,
    promptHash: string,
    cacheHit: boolean,
    source: string,
    actualCost: number,
    baselineCost: number,
    piiEntities: Array<{ entity_type: string; value: string }>,
    latencyMs: number,
  ): Promise<void> {
    const savings = Math.max(baselineCost - actualCost, 0);
    await this.db.query(
      `
      INSERT INTO savings_ledger (tenant_id, model, prompt_hash, cache_hit, source, cost_usd, baseline_cost_usd, savings_usd, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [tenantId, model, promptHash, cacheHit, source, actualCost, baselineCost, savings, JSON.stringify({ pii_count: piiEntities.length })],
    );
    await this.db.query(
      `
      INSERT INTO metadata_audit_log (tenant_id, event_type, model, latency_ms, pii_entities, status)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      `,
      [
        tenantId,
        "chat_completion",
        model,
        latencyMs,
        JSON.stringify(piiEntities.map((entity) => entity.entity_type)),
        "ok",
      ],
    );
  }
}
