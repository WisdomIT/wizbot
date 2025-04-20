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

  if (credential.expiresIn.getTime() > new Date().getTime()) {
    return {
      accessToken: credential.accessToken,
    };
  }

  // Refresh token
  const refreshTokenRequest = await chzzk.authorization.refreshToken({
    refreshToken: credential.refreshToken,
  });
  if (refreshTokenRequest.code !== 200) {
    throw new Error('Invalid response from Chzzk on refresh token request');
  }
  const { accessToken, refreshToken, tokenType, expiresIn } = refreshTokenRequest.content;
  await ctx.prisma.oAuthCredential.update({
    where: {
      userId,
    },
    data: {
      accessToken,
      refreshToken,
      tokenType,
      expiresIn: new Date(new Date().getTime() + Number(expiresIn) * 1000),
    },
  });
}
