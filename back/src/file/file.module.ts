import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { DocumentParserService } from './document.parser';
import { PrismaModule } from '../prisma/prisma.module';
import { VectorizerModule } from '../vectorizer/vectorizer.module';

@Module({
  imports: [PrismaModule, VectorizerModule],
  controllers: [FileController],
  providers: [FileService, DocumentParserService],
})
export class FileModule {}
