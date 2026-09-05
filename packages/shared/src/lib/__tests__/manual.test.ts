import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';

import { getManualPage, listManualPages, searchManual } from '../manual';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-'));
fs.writeFileSync(
  path.join(dir, 'alpha.md'),
  '---\ntitle: 알파\naudience: streamer\norder: 2\ndescription: 첫 문서\n---\n\n본문입니다.\n명령어 이름에는 띄어쓰기를 쓸 수 있습니다.\n다음 줄.\n',
);
fs.writeFileSync(path.join(dir, 'beta.md'), '---\ntitle: 베타\naudience: viewer\norder: 1\ndescription: 둘째\n---\n\n시청자용.\n');
fs.writeFileSync(path.join(dir, 'no-front.md'), '프론트매터 없는 문서\n');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('이용 안내 리더 (#35 3/3)', () => {
  it('목차는 order 순, frontmatter 없는 파일은 기본값으로', () => {
    const pages = listManualPages(dir);
    expect(pages.map((page) => page.slug)).toEqual(['beta', 'alpha', 'no-front']);
    expect(pages[1]).toMatchObject({ title: '알파', audience: 'streamer', description: '첫 문서' });
    expect(pages[2]).toMatchObject({ title: 'no-front', audience: 'streamer', order: 999 });
  });

  it('본문 읽기 + 경로 조작 방지', () => {
    expect(getManualPage('alpha', dir)?.body).toContain('본문입니다.');
    expect(getManualPage('../secret', dir)).toBeNull();
    expect(getManualPage('없는문서', dir)).toBeNull();
  });

  it('검색은 대소문자 무시 줄 일치 + 앞뒤 문맥', () => {
    const hits = searchManual('띄어쓰기', dir);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ slug: 'alpha', title: '알파' });
    expect(hits[0].snippet).toContain('본문입니다.');
    expect(hits[0].snippet).toContain('다음 줄.');
    expect(searchManual('', dir)).toEqual([]);
  });
});
