import { Request } from 'express';
import { RequestUser } from './request-user.interface';

export interface RequestContext extends Request {
  user?: RequestUser;
  correlationId?: string;
}
