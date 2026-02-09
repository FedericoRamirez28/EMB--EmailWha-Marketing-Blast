import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendTextDto {
  /** Teléfono destino en formato internacional, ej: 54911XXXXXXXX */
  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  /** Si querés: para track interno */
  @IsString()
  @IsOptional()
  clientRef?: string;
}
