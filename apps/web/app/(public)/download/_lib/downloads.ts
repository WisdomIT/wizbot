/**
 * 플레이어 앱 다운로드 대상 (#117).
 *
 * 산출물 이름은 electron-builder 에서 **버전 없이 고정**돼 있어 정적 링크를 쓸 수 있다.
 * (apps/player/electron-builder.yml 의 artifactName)
 * GitHub API 로 최신 자산을 조회하는 방법도 있으나 요청과 실패 처리가 늘어난다.
 */
const RELEASE_BASE = 'https://github.com/WisdomIT/wizbot/releases/latest/download';

export type Platform = 'mac' | 'windows';

export type DownloadTarget = {
  id: string;
  platform: Platform;
  label: string;
  hint: string;
  file: string;
};

export const DOWNLOADS: DownloadTarget[] = [
  {
    id: 'mac-arm64',
    platform: 'mac',
    label: 'macOS (Apple Silicon)',
    hint: 'M1 이후 맥',
    file: 'wizbot-player-mac-arm64.dmg',
  },
  {
    id: 'mac-x64',
    platform: 'mac',
    label: 'macOS (Intel)',
    hint: '2020년 이전 맥',
    file: 'wizbot-player-mac-x64.dmg',
  },
  {
    id: 'win-x64',
    platform: 'windows',
    label: 'Windows',
    hint: '64비트',
    file: 'wizbot-player-win-x64.exe',
  },
];

export function downloadUrl(target: DownloadTarget) {
  return `${RELEASE_BASE}/${target.file}`;
}
