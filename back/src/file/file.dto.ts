import { IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class CheckFileDto {
  @IsString()
  @IsNotEmpty()
  fileHash!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  /** 前端用 string 传输 BigInt，service 层转换 */
  @IsString()
  @IsNotEmpty()
  fileSize!: string;

  @IsUUID()
  sessionId!: string;
}

export class MergeChunksDto {
  @IsString()
  @IsNotEmpty()
  fileHash!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  fileSize!: string;

  @IsUUID()
  sessionId!: string;

  @IsNumber()
  @Min(1)
  totalChunks!: number;
}
