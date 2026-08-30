export type Permission = 'STREAMER' | 'MANAGER' | 'VIEWER';

const LABEL: Record<Permission, string> = {
  STREAMER: '스트리머',
  MANAGER: '매니저',
  VIEWER: '시청자',
};

export function permissionLabel(permission: Permission): string {
  return LABEL[permission] ?? '알 수 없음';
}
