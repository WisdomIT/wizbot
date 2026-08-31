import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { buildDiscordPayload, maskWebhookUrl, notifyAdmins, testWebhook } from '../notify';

const message = { title: '사용 신청: 위즈', lines: ['위즈 채널이 신청했습니다.', null, '채널 ID: abc'], link: { label: '처리', url: 'https://bot.test/admin/applications' } };

describe('디스코드 payload (#207)', () => {
  it('embed 제목·본문(빈 줄 제거)·링크·종류 라벨', () => {
    const p = buildDiscordPayload('SIGNUP', message);
    expect(p.username).toBe('위즈봇');
    expect(p.embeds[0].title).toBe('사용 신청: 위즈');
    expect(p.embeds[0].description).toBe('위즈 채널이 신청했습니다.\n채널 ID: abc\n[처리](https://bot.test/admin/applications)');
    expect(p.embeds[0].footer.text).toBe('사용 신청');
  });
  it('긴 본문은 잘린다', () => {
    const p = buildDiscordPayload('ERROR', { title: 't', lines: ['a'.repeat(5000)] });
    expect(p.embeds[0].description.length).toBeLessThan(2000);
  });
  it('URL 마스킹은 끝 4자만', () => {
    expect(maskWebhookUrl('https://discord.com/api/webhooks/123/abcdWXYZ')).toBe('…WXYZ');
  });
});

function db(webhook: { url: string; enabled: boolean } | null) {
  return {
    admin: { findMany: vi.fn().mockResolvedValue([]) },
    discordWebhook: { findUnique: vi.fn().mockResolvedValue(webhook && { kind: 'SIGNUP', ...webhook }) },
  } as unknown as PrismaClient;
}

describe('notifyAdmins', () => {
  it('등록·활성 웹훅이면 그 URL 로 POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const sent = await notifyAdmins(db({ url: 'https://discord.com/api/webhooks/1/x', enabled: true }), 'SIGNUP', message, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith('https://discord.com/api/webhooks/1/x', expect.objectContaining({ method: 'POST' }));
    expect(sent.discordSent).toBe(true);
    expect(sent.mailSent).toBe(false); // 관리자 0명
  });
  it('미등록·비활성이면 보내지 않고, 실패해도 throw 하지 않고 발송 여부만 돌려준다', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
    await expect(notifyAdmins(db(null), 'SIGNUP', message, fetchMock)).resolves.toEqual({ mailSent: false, discordSent: false });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(notifyAdmins(db({ url: 'https://discord.com/api/webhooks/1/x', enabled: false }), 'SIGNUP', message, fetchMock)).resolves.toEqual({ mailSent: false, discordSent: false });
    expect(fetchMock).not.toHaveBeenCalled();
    //  등록·활성인데 디스코드가 죽어 있어도 throw 없이 discordSent: false
    await expect(notifyAdmins(db({ url: 'https://discord.com/api/webhooks/1/x', enabled: true }), 'SIGNUP', message, fetchMock)).resolves.toMatchObject({ discordSent: false });
  });
});

describe('testWebhook', () => {
  it('비활성이어도 보내고, 거부되면 사유를 돌려준다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(testWebhook(db({ url: 'https://discord.com/api/webhooks/1/x', enabled: false }), 'SIGNUP', fetchMock)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(testWebhook(db(null), 'SIGNUP', fetchMock)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
