import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@Controller('auth/airtable')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('connect')
  connect(@Res() res: Response) {
    const { url } = this.authService.generateAuthUrl();
    res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:4200');
    if (error) {
      return res.redirect(`${frontendUrl}/?error=auth_cancelled`);
    }
    try {
      const { connectionId } = await this.authService.exchangeCode(code, state);
      res.redirect(`${frontendUrl}/?connected=true&connectionId=${connectionId}`);
    } catch (err) {
      res.redirect(`${frontendUrl}/?error=auth_failed`);
    }
  }

  @Get('status')
  async status(@Query('connectionId') id: string) {
    return { connected: await this.authService.isConnected(id ?? '') };
  }
}
