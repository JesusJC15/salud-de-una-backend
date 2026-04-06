import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type AiPromptDefinitionDocument = HydratedDocument<AiPromptDefinition>;

@Schema({ timestamps: true })
export class AiPromptDefinition {
  @Prop({ required: true, index: true, trim: true })
  key!: string;

  @Prop({ required: true, min: 1 })
  version!: number;

  @Prop({ required: true, trim: true })
  provider!: string;

  @Prop({ required: true, trim: true })
  model!: string;

  @Prop({ required: true })
  systemInstruction!: string;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AiPromptDefinitionSchema =
  SchemaFactory.createForClass(AiPromptDefinition);

AiPromptDefinitionSchema.index({ key: 1, version: 1 }, { unique: true });
