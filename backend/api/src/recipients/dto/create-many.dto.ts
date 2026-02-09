import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export type CreateRecipientRow = {
  name?: string
  email: string
  tags?: string
  blockId?: number
}

export class CreateManyRecipientsDto {
  @IsArray()
  rows!: CreateRecipientRow[]
}

export class BulkMoveDto {
  @IsArray()
  ids!: number[]

  @IsInt()
  @Min(0)
  destBlockId!: number
}

export class BulkDeleteDto {
  @IsArray()
  ids!: number[]
}

export class DeleteOneParams {
  @IsInt()
  @Min(1)
  id!: number
}
