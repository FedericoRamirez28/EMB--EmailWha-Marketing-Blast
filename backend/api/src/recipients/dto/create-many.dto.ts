import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class RecipientRowDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsString()
  email!: string

  @IsOptional()
  @IsString()
  tags?: string

  @IsOptional()
  @IsInt()
  blockId?: number
}

export class CreateManyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientRowDto)
  recipients!: RecipientRowDto[]
}