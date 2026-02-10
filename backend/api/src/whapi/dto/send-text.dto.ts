import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class SendTextDto {
  @IsString()
  @IsNotEmpty()
  to!: string

  @IsString()
  @IsNotEmpty()
  body!: string

  @IsString()
  @IsOptional()
  clientRef?: string
}
