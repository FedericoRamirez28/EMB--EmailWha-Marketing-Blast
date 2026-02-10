import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator'

export class ImportPhoneRowDto {
  @IsString()
  phone!: string

  @IsOptional()
  @IsString()
  name?: string
}

export class ImportPhonesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  blockId!: number

  @IsOptional()
  @IsString()
  tags?: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportPhoneRowDto)
  rows!: ImportPhoneRowDto[]
}
