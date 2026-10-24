import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiController } from "./controllers/ai.controller";
import { DashboardController } from "./controllers/dashboard.controller";
import { TenantController } from "./controllers/tenant.controller";
import { AiService } from "./services/ai.service";
import { CacheService } from "./services/cache.service";
import { DatabaseService } from "./services/database.service";
import { TenantService } from "./services/tenant.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HttpModule],
  controllers: [AiController, DashboardController, TenantController],
  providers: [AiService, CacheService, DatabaseService, TenantService],
})
export class AppModule {}
