import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentCipher, cipherFromEnv } from './document-cipher';
import { DOCUMENT_STORAGE, LocalDiskStorage } from './document-storage';

/**
 * Private document storage (D-32). The API refuses to start without a valid
 * encryption key, the way it refuses to start without its JWT secrets.
 */
@Global()
@Module({
  providers: [
    {
      provide: DocumentCipher,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => cipherFromEnv((name) => config.get<string>(name)),
    },
    {
      provide: DOCUMENT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('STORAGE_DRIVER') ?? 'local';
        if (driver !== 'local') {
          throw new Error(`STORAGE_DRIVER=${driver} : seul "local" existe pour l'instant.`);
        }
        const path = config.get<string>('STORAGE_LOCAL_PATH');
        if (!path) throw new Error('STORAGE_LOCAL_PATH doit être défini (voir .env.example).');
        return new LocalDiskStorage(path);
      },
    },
  ],
  exports: [DocumentCipher, DOCUMENT_STORAGE],
})
export class StorageModule {}
