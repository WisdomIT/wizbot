import 'server-only';

import { cache } from 'react';

import { trpc } from '@/src/utils/trpc';

/**
 * 현재 스트리머 세션의 계정 정보. React cache 로 같은 요청 안에서는 한 번만 API 를 부른다 —
 * 레이아웃과 generateMetadata(파비콘) 가 각각 부르기 때문이다 (#77).
 */
export const getMe = cache(() => trpc.user.me.query().catch(() => null));
