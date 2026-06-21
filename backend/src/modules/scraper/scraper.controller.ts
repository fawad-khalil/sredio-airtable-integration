import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('start')
  @HttpCode(202)
  start() {
    this.scraperService.startScrape().catch(err => console.error('Scraper error:', err));
    return { message: 'Scraper started' };
  }

  @Post('cookies')
  @HttpCode(200)
  setCookies(@Body() body: { cookies: string }) {
    this.scraperService.setCookies(body.cookies);
    return { message: 'Cookies stored. Call POST /scraper/start to begin scraping.' };
  }

  @Post('mfa')
  @HttpCode(200)
  mfa(@Body() body: { code: string }) {
    this.scraperService.submitMfaCode(body.code);
    return { message: 'MFA code submitted' };
  }

  @Get('status')
  status() {
    return this.scraperService.getStatus();
  }
}
