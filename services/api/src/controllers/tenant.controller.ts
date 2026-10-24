import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { TenantService } from "../services/tenant.service";

@Controller("tenants")
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  async upsertTenant(
    @Body()
    body: {
      id: string;
      name: string;
      monthlyBudgetUsd?: number;
      failClosed?: boolean;
    },
  ) {
    return this.tenantService.upsertTenant(body);
  }

  @Get(":id")
  async getTenant(@Param("id") id: string) {
    return this.tenantService.getTenant(id);
  }
}
