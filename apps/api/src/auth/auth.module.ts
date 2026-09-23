import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticationGuard } from './guards/authentication.guard';
import { CourierAppVersionGuard } from './guards/courier-app-version.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ImpersonationService } from './impersonation.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordsService } from './passwords.service';
import { SessionsService } from './sessions.service';
import { TokensService, requireSecret } from './tokens.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireSecret(config, 'JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    ImpersonationService,
    LoginThrottleService,
    PasswordsService,
    SessionsService,
    TokensService,
    // Global guards run in this order: who you are, which app version, what
    // you may do. Deny by default applies to every controller of the API.
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: CourierAppVersionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PasswordsService, SessionsService],
})
export class AuthModule {}
