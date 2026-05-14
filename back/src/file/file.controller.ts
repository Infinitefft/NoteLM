import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileService } from './file.service';
import { CheckFileDto, MergeChunksDto } from './file.dto';

@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /** 检查文件是否存在（秒传 / 续传） */
  @Post('check')
  check(@Body() dto: CheckFileDto) {
    return this.fileService.check(dto);
  }

  /** 上传分片 */
  @Post('upload')
  @UseInterceptors(FileInterceptor('chunk'))
  uploadChunk(
    @UploadedFile() chunk: Express.Multer.File,
    @Body('fileHash') fileHash: string,
    @Body('chunkIndex') chunkIndex: string,
    @Body('sessionId') sessionId: string,
  ) {
    return this.fileService.uploadChunk(
      fileHash,
      parseInt(chunkIndex, 10),
      chunk.buffer,
    );
  }

  /** 合并分片 */
  @Post('merge')
  merge(@Body() dto: MergeChunksDto) {
    return this.fileService.merge(dto);
  }
}
