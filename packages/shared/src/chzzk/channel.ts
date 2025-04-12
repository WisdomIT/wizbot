import { http } from '../../lib/http';
import { CHZZK_URI, CLIENT_AUTH_HEADERS } from './chzzk.config';
import { ChzzkTokenResponse, ChzzkApiResponse, ChzzkChannelsRequest } from './index.d';

export function channels(
  data: ChzzkChannelsRequest,
): Promise<ChzzkApiResponse<ChzzkTokenResponse>> {
  if (!data.channelIds || data.channelIds.length === 0) {
    throw new Error('Channel IDs are required');
  }
  if (data.channelIds.length > 20) {
    throw new Error('channelIds length must be less than or equal to 20');
  }

  return http<ChzzkApiResponse<ChzzkTokenResponse>>(`${CHZZK_URI}/open/v1/channels`, 'GET', {
    headers: CLIENT_AUTH_HEADERS,
    params: {
      channelIds: data.channelIds.join(','),
    },
  });
}
