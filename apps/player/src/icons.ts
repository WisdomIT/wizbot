import { app, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 트레이 아이콘.
 *
 * macOS 메뉴 막대는 **템플릿 이미지**(검정 단색 + 투명 배경)를 쓴다 — 다크/라이트에 맞춰
 * 시스템이 색을 뒤집어 준다. Windows 는 컬러 아이콘을 그대로 쓴다.
 *
 * 파일이 없으면 트레이를 만들지 않는다. 빈 이미지로 Tray 를 만들면 macOS 에서
 * Chromium CHECK 에 걸려 앱이 시작하자마자 죽는다.
 */
function resourcePath(fileName: string) {
  // 패키징하면 extraResources 가 Resources/ 로 복사된다
  return app.isPackaged
    ? join(process.resourcesPath, fileName)
    : join(__dirname, '..', 'resources', fileName);
}

export function loadTrayIcon() {
  const fileName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const path = resourcePath(fileName);

  if (!existsSync(path)) return null;

  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) return null;

  // macOS 는 템플릿으로 표시해야 메뉴 막대 테마에 맞춰 색이 바뀐다
  if (process.platform === 'darwin') image.setTemplateImage(true);

  return image;
}
