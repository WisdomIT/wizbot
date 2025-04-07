import { z } from 'zod';

import { http } from '../../lib/http';
import { t } from '../trpc';

const CHZZK_URI = 'https://openapi.chzzk.naver.com';

export const userRouter = t.router({
  getUser: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findFirst();
  }),
  getChzzkId: t.procedure.query(() => {
    return process.env.CHZZK_ID;
  }),
  getChzzkTokenInterlock: t.procedure
    .input(z.object({ code: z.string() }))
    .query(async ({ ctx, input }) => {
      const { code } = input;
      const { CHZZK_ID, CHZZK_SECRET } = process.env;

      try {
        if (!CHZZK_ID || !CHZZK_SECRET) {
          throw new Error('Chzzk credentials are not set');
        }
        if (!code) {
          throw new Error('Authorization code is required');
        }

        const response = await http<{
          accessToken: string;
          refreshToken: string;
          tokenType: 'Bearer';
          expiresIn: string;
          scope: string;
        }>(`${CHZZK_URI}/auth/v1/token`, 'POST', {
          json: {
            grantType: 'authorization_code',
            clientId: CHZZK_ID,
            clientSecret: CHZZK_SECRET,
            code,
            state: 'zxclDasdfA25',
          },
        });

        if (response.accessToken) {
          const { accessToken, refreshToken, tokenType, expiresIn } = response;
          return {
            accessToken,
            refreshToken,
            tokenType,
            expiresIn: new Date(new Date().getTime() + Number(expiresIn) * 1000),
          };
        } else {
          throw new Error('Invalid response from Chzzk');
        }
      } catch (error) {
        console.error('Error fetching access token:', error);
        throw new Error('Failed to get access token');
      }
    }),
});
