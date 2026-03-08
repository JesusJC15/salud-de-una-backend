import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Public()
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  @Public()
  getReadiness() {
    return this.appService.getReadiness();
  }
}
