import type { ThemeFontKey } from '@wizbot/shared/lib/theme';
import {
  Black_Han_Sans,
  Dongle,
  Gaegu,
  Gamja_Flower,
  Hahmlet,
  Jua,
  Nanum_Gothic,
  Nanum_Myeongjo,
  Nanum_Pen_Script,
  Noto_Sans_KR,
  Orbit,
  Poor_Story,
  Yeon_Sung,
} from 'next/font/google';

/**
 * 스트리머 테마 폰트 (#77). 키 목록은 packages/shared/src/lib/theme.ts 가 정의하고 여기서 로딩한다.
 *
 * next/font 는 빌드 시 Google Fonts 에서 받아 셀프호스팅한다 — 방문자 브라우저가 구글에 접속하지 않는다.
 * preload: false — 14종을 전부 <link rel=preload> 하면 첫 화면이 무거워진다. @font-face 만 선언해 두고
 * 스트리머가 고른 폰트만 브라우저가 실제로 내려받는다.
 *
 * 한글 서브셋: next/font 데이터에는 latin 만 잡히지만 폰트 파일 자체가 한글 폰트라 unicode-range 로
 * 한글 블록이 함께 내려온다.
 */
//  next/font 는 옵션을 호출 지점의 리터럴로만 받는다 (readonly 튜플·공유 객체는 타입이 맞지 않는다)
const notoSansKr = Noto_Sans_KR({ display: 'swap', preload: false, subsets: ['latin'], variable: '--font-noto-sans-kr' });
const nanumGothic = Nanum_Gothic({ display: 'swap', preload: false, subsets: ['latin'], weight: ['400', '700'], variable: '--font-nanum-gothic' });
const nanumMyeongjo = Nanum_Myeongjo({ display: 'swap', preload: false, subsets: ['latin'], weight: ['400', '700'], variable: '--font-nanum-myeongjo' });
const blackHanSans = Black_Han_Sans({ display: 'swap', preload: false, subsets: ['latin'], weight: '400', variable: '--font-black-han-sans' });
const nanumPenScript = Nanum_Pen_Script({ display: 'swap', preload: false, subsets: ['latin'], weight: '400', variable: '--font-nanum-pen-script' });
const dongle = Dongle({ display: 'swap', preload: false, subsets: ['latin'], weight: ['400', '700'], variable: '--font-dongle' });
const jua = Jua({ display: 'swap', preload: false, subsets: ['latin'], weight: '400', variable: '--font-jua' });
const hahmlet = Hahmlet({ display: 'swap', preload: false, subsets: ['latin'], variable: '--font-hahmlet' });
const gaegu = Gaegu({ display: 'swap', preload: false, subsets: ['latin'], weight: ['400', '700'], variable: '--font-gaegu' });
const poorStory = Poor_Story({ display: 'swap', preload: false, subsets: ['latin'], weight: '400', variable: '--font-poor-story' });
const gamjaFlower = Gamja_Flower({ display: 'swap', preload: false, subsets: ['latin'], weight: '400', variable: '--font-gamja-flower' });
const yeonSung = Yeon_Sung({ display: 'swap', preload: false, subsets: ['latin'], weight: '400', variable: '--font-yeon-sung' });
const orbit = Orbit({ display: 'swap', preload: false, subsets: ['latin'], weight: '400', variable: '--font-orbit' });

/** 키 → 폰트 className. suit 는 body 기본이라 클래스가 없다(빈 문자열) */
export const FONT_CLASS: Record<ThemeFontKey, string> = {
  suit: '',
  'noto-sans-kr': notoSansKr.className,
  'nanum-gothic': nanumGothic.className,
  'nanum-myeongjo': nanumMyeongjo.className,
  'black-han-sans': blackHanSans.className,
  'nanum-pen-script': nanumPenScript.className,
  dongle: dongle.className,
  jua: jua.className,
  hahmlet: hahmlet.className,
  gaegu: gaegu.className,
  'poor-story': poorStory.className,
  'gamja-flower': gamjaFlower.className,
  'yeon-sung': yeonSung.className,
  orbit: orbit.className,
};
