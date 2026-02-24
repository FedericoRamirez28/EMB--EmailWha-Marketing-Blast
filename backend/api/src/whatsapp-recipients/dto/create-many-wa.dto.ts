import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class WaRecipientRowDto {
  @IsString()
  phone!: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  tags?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  blockId?: number
}

export class CreateManyWaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WaRecipientRowDto)
  recipients!: WaRecipientRowDto[]
}