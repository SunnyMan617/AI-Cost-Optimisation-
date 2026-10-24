import { Body, Controller, Post } from "@nestjs/common";
import { AiService } from "../services/ai.service";
import { ChatRequestDto } from "../types";

@Controller("v1")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("chat/completions")
  async chatCompletions(@Body() body: ChatRequestDto) {
    return this.aiService.processChat(body);
  }
}
