import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { Specialty } from '../common/enums/specialty.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { BillingService } from './billing.service';
import { InitiateCheckoutDto } from './dto/initiate-checkout.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { UpdatePriceDto } from './dto/update-price.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('prices')
  @Roles(UserRole.PATIENT)
  getPrices() {
    return this.billingService.getActivePrices();
  }

  @Post('checkout')
  @Roles(UserRole.PATIENT)
  initiateCheckout(
    @Body() dto: InitiateCheckoutDto,
    @Req() req: RequestContext,
  ) {
    return this.billingService.initiateCheckout(dto.consultationId, req.user!);
  }

  @Post('checkout/:transactionId/confirm')
  @Roles(UserRole.PATIENT)
  confirmCheckout(
    @Param('transactionId') transactionId: string,
    @Req() req: RequestContext,
  ) {
    return this.billingService.confirmCheckout(transactionId, req.user!);
  }

  @Get('transactions/me')
  @Roles(UserRole.PATIENT)
  getMyTransactions(
    @Req() req: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.billingService.getMyTransactions(req.user!, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('transactions/me/:id')
  @Roles(UserRole.PATIENT)
  getTransaction(@Param('id') id: string, @Req() req: RequestContext) {
    return this.billingService.getTransactionById(id, req.user!);
  }

  @Get('admin/transactions')
  @Roles(UserRole.ADMIN)
  getAllTransactions(@Query() query: ListTransactionsDto) {
    return this.billingService.getAllTransactions({
      from: query.from,
      to: query.to,
      specialty: query.specialty,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('admin/revenue')
  @Roles(UserRole.ADMIN)
  getRevenue() {
    return this.billingService.getRevenueMetrics();
  }

  @Get('admin/prices')
  @Roles(UserRole.ADMIN)
  getAdminPrices() {
    return this.billingService.getActivePrices();
  }

  @Patch('admin/prices/:specialty')
  @Roles(UserRole.ADMIN)
  updatePrice(
    @Param('specialty') specialty: string,
    @Body() dto: UpdatePriceDto,
  ) {
    return this.billingService.updatePrice(specialty as Specialty, dto.amount);
  }
}
