import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsString()
  @IsNotEmpty()
  body!: string

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
}
