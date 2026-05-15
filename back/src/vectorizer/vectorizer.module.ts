import { Global, Module } from '@nestjs/common';
import { VectorizerService } from './vectorizer.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [VectorizerService],
  exports: [VectorizerService],
})
export class VectorizerModule {}
