import { Global, Module } from '@nestjs/common';
import { VectorizerService } from './vectorizer.service';
import { RagService } from './rag.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';

@Global()
@Module({
  imports: [PrismaModule, LlmModule],
  providers: [VectorizerService, RagService],
  exports: [VectorizerService, RagService],
})
export class VectorizerModule {}
