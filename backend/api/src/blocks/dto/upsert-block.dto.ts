import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export type BlockChannel = 'whatsapp' | 'email'

export class UpsertBlockDto {
  @IsInt()
  id!: number

  @IsString()
  name!: string

  @IsInt()
  @Min(1)
  @Max(2000)
  capacity!: number

  // ✅ opcional, si no mandás nada => whatsapp
  @IsOptional()
  @IsEnum(['whatsapp', 'email'])
  channel?: BlockChannel
}