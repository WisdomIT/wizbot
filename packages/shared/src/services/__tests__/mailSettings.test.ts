import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { resolveMailConfig } from '../../lib/nodemailer';
import { setMailSettings } from '../notify';

function db(row: { host: string; port: number; user: string; pass: string; sender: string } | null) {
  return {
    mailSettings: {
      findUnique: vi.fn().mockResolvedValue(row && { id: 1, ...row }),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaClient;
}

const row = { host: 'smtp.test', port: 465, user: 'bot@test', pass: 'secret', sender: 'no-reply@test' };

describe('SMTP 설정 DB 관리 (#215)', () => {
  it('DB 행이 있으면 그 값, 없으면 env 폴백', async () => {
    await expect(resolveMailConfig(db(row))).resolves.toMatchObject({ host: 'smtp.test', source: 'db' });
    vi.stubEnv('SMTP_HOST', 'env.test');
    vi.stubEnv('SMTP_PORT', '587');
    await expect(resolveMailConfig(db(null))).resolves.toMatchObject({ host: 'env.test', port: 587, source: 'env' });
    vi.unstubAllEnvs();
  });

  it('저장: 비밀번호를 비우면 기존 값 유지, 저장된 값도 없으면 거부', async () => {
    const withRow = db(row);
    await setMailSettings(withRow, { host: 'smtp.new', port: 465, user: 'bot@test', pass: '', sender: 'no-reply@test' });
    expect(withRow.mailSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ host: 'smtp.new', pass: 'secret' }) }),
    );
    await expect(
      setMailSettings(db(null), { host: 'smtp.new', port: 465, user: 'bot@test', pass: '', sender: 'no-reply@test' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      setMailSettings(db(null), { host: '', port: 465, user: 'bot@test', pass: 'x', sender: 'no-reply@test' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
