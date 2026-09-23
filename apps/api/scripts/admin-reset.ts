import { randomBytes } from 'node:crypto';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * The escape hatch of Q9b, run on the VPS:
 *
 *   pnpm --filter @faffago/api admin:reset <username>
 *
 * Nobody but an admin can reset a password, so if the last admin loses his the
 * platform would be unreachable. This command prints a new random password
 * once, revokes every session of that account, and writes an audit entry.
 *
 * It exists because it runs on the server, where having shell access is already
 * the highest privilege there is. It is not reachable from the API.
 */

const prisma = new PrismaClient();

function generatePassword(): string {
  // No characters that can be confused when the password is read aloud.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < 14) {
    for (const byte of randomBytes(24)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === 14) break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const username = process.argv[2]?.trim().toLowerCase();
  if (!username) {
    console.error('Usage : pnpm --filter @faffago/api admin:reset <username>');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findFirst({ where: { username, role: Role.ADMIN } });
  if (!user) {
    console.error(`Aucun compte admin avec l'identifiant « ${username} ».`);
    process.exitCode = 1;
    return;
  }

  const password = generatePassword();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordUpdatedAt: new Date(), isActive: true },
    }),
    // Every device that was logged in as this admin is signed out.
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorUserId: null,
        actorRole: null,
        action: 'REGENERATION_MOT_DE_PASSE_CLI',
        entityType: 'user',
        entityId: user.id,
        reason: 'Réinitialisation admin depuis la ligne de commande du serveur',
        after: { username, passwordUpdatedAt: new Date().toISOString() },
      },
    }),
  ]);

  console.log('\n─────────────────────────────────────────────');
  console.log("  Mot de passe régénéré. Il ne sera plus affiché.");
  console.log(`  Identifiant : ${username}`);
  console.log(`  Mot de passe : ${password}`);
  console.log('  Toutes les sessions de ce compte ont été révoquées.');
  console.log('─────────────────────────────────────────────\n');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
