import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OAuthToken, OAuthTokenSchema } from '../../schemas/oauth-token.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: OAuthToken.name, schema: OAuthTokenSchema }])],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
