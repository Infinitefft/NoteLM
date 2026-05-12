import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class CreateSessionDto {
  @IsString()
  @IsOptional()
  title?: string;
}

export class UpdateSessionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;
}
