import chzzk from '../chzzk';
import { Context } from '../trpc';

export async function getAccessToken(ctx: Context, userId: number) {
  const credential = await ctx.prisma.oAuthCredential.findFirst({
    where: {
      userId,
    },
  });
  if (!credential) {
    throw new Error('Invalid response from Chzzk on me request');
  }

  let accessToken = credential.accessToken;

  // Check if the access token is expired
  try {
    const meRequest = await chzzk.user.me(accessToken);
    if (meRequest.code !== 200) {
      // Refresh token
      const refreshTokenRequest = await chzzk.authorization.refreshToken({
        refreshToken: credential.refreshToken,
      });
      if (refreshTokenRequest.code !== 200) {
        throw new Error('Invalid response from Chzzk on refresh token request');
      }
      const {
        accessToken: accessTokenNew,
        refreshToken,
        tokenType,
        expiresIn,
      } = refreshTokenRequest.content;
      await ctx.prisma.oAuthCredential.update({
        where: {
          userId,
        },
        data: {
          accessToken: accessTokenNew,
          refreshToken,
          tokenType,
          expiresIn: new Date(new Date().getTime() + Number(expiresIn) * 1000),
        },
      });

      accessToken = accessTokenNew;
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error('Invalid response from Chzzk on me request');
    }
  }

  return accessToken;
}
