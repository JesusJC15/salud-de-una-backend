import { Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  getMine(@Req() req: RequestContext, @Query() query: ListNotificationsDto) {
    return this.notificationsService.getMine(
      req.user!,
      query.unreadOnly ?? false,
      query.limit ?? 20,
    );
  }

  @Patch(':notificationId/read')
  markAsRead(
    @Req() req: RequestContext,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(notificationId, req.user!);
  }

  @Patch('me/read-all')
  markAllAsRead(@Req() req: RequestContext) {
    return this.notificationsService.markAllAsRead(req.user!);
  }
}
