import { http } from '../../lib/http';
import { CHZZK_URI, CLIENT_AUTH_HEADERS } from './chzzk.config';
import {
  ChzzkApiResponse,
  ChzzkCategoriesSearchRequest,
  ChzzkCategoriesSearchResponse,
} from './index.d';

export function search(
  data: ChzzkCategoriesSearchRequest,
): Promise<ChzzkApiResponse<ChzzkCategoriesSearchResponse>> {
  return http<ChzzkApiResponse<ChzzkCategoriesSearchResponse>>(
    `${CHZZK_URI}/open/v1/categories/search`,
    'GET',
    {
      headers: CLIENT_AUTH_HEADERS,
      params: {
        size: data.size,
        query: data.query,
      },
    },
  );
}
