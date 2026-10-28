// Reference for the common API error interceptor. Map reviewed error codes to
// static public text; never forward response.message/stackTrace to an HTML sink.
// The complete production mapping must be reviewed against the API contract.
const messages = Object.freeze({
  COMM1007: '다시 로그인해 주세요.',
  COMM1008: '로그인이 필요합니다.',
});
export const defaultPublicErrorMessage = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function getPublicErrorMessage(apiBody) {
  if (!apiBody || typeof apiBody !== 'object' || Array.isArray(apiBody)) return defaultPublicErrorMessage;
  if (!Object.hasOwn(apiBody, 'errorCode')) return defaultPublicErrorMessage;
  const code = apiBody.errorCode;
  return typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] : defaultPublicErrorMessage;
}
