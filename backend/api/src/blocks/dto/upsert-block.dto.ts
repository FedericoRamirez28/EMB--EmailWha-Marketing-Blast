import { IsInt, IsString, Max, Min } from 'class-validator'

export class UpsertBlockDto {
  @IsInt()
  @Min(1)
  id!: number

  @IsString()
  name!: string

  @IsInt()
  @Min(1)
  @Max(2000)
  capacity!: number
}
