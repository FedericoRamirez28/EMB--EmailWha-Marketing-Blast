import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class UpsertBlockDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  id?: number

  @IsString()
  name!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  capacity!: number
}
