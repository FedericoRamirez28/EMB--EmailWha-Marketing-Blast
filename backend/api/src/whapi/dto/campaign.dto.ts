import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string

  // ✅ ahora body es opcional (para imagen/video sin texto)
  @IsString()
  @IsOptional()
  body?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  blockId?: number

  @IsString()
  @IsOptional()
  tags?: string

  @IsOptional()
  @IsBoolean()
  requireAllTags?: boolean

  @Type(() => Number)
  @IsInt()
  @Min(250)
  @IsOptional()
  delayMs?: number

  // ✅ tipo de campaña
  @IsOptional()
  @IsIn(['text', 'image', 'video', 'document'])
  mediaType?: 'text' | 'image' | 'video' | 'document'

  // ✅ adjunto desde attachments (solo para image/video/document)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  attachmentId?: number

  // ✅ programación
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string
}