export function ready(data, expectedId) {
  if (data.user?.id !== expectedId) throw new Error('Gateway bot identity mismatch');
  return { sessionId: data.session_id, resumeUrl: data.resume_gateway_url };
}
