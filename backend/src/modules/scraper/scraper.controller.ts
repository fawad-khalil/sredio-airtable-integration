import { Controller, Get, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  // SENSITIVE: `body` may contain Airtable email/password (credentials login). Never log this body.
  @Post('start')
  @HttpCode(202)
  start(
    @Headers('x-connection-id') connectionId: string,
    @Body() body: { method?: string; email?: string; password?: string },
  ) {
    this.scraperService.startScrape(connectionId ?? '', body ?? {}).catch(() => console.error('Scraper start failed'));
    return { message: 'Scraper started' };
  }

  @Post('cookies')
  @HttpCode(200)
  async setCookies(@Headers('x-connection-id') connectionId: string, @Body() body: { cookies: string }) {
    await this.scraperService.setCookies(connectionId ?? '', body.cookies);
    return { message: 'Cookies stored. Call POST /scraper/start to begin scraping.' };
  }

  @Post('mfa')
  @HttpCode(200)
  mfa(@Body() body: { code: string }) {
    this.scraperService.submitMfaCode(body.code);
    return { message: 'MFA code submitted' };
  }

  @Get('status')
  async status(@Headers('x-connection-id') connectionId: string) {
    return this.scraperService.getStatus(connectionId ?? '');
  }
}
