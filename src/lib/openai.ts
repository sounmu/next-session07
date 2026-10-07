import "server-only";
import OpenAI from "openai";
import { buildCharacterInstructions } from "@/prompts/character";
import { MAX_MESSAGE_LENGTH, type Message } from "@/lib/chat";

// 이 오류에만 브라우저에 보여도 되는 문구를 넣습니다. SDK 원문은 보내지 않습니다.
export class ChatError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function generateReply(messages: Message[], signal: AbortSignal): Promise<string> {
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim();
  if (!apiKey || !model) {
    throw new ChatError("서버의 AI_API_KEY와 AI_MODEL 설정을 확인해 주세요.", 503);
  }
  if (!baseUrl) {
    throw new ChatError("서버의 AI_BASE_URL 설정을 확인해 주세요.", 503);
  }

  // 요청 시 생성하여 API 키 없이도 빌드할 수 있습니다. 키는 서버에만 존재합니다.
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: 30_000,
    maxRetries: 0,
  });
  const response = await client.responses.create(
    {
      model,
      instructions: buildCharacterInstructions(), // 매 요청마다 서버의 캐릭터 설정 적용
      input: messages, // 사용자 대화는 instructions와 별개로 전달
      reasoning: {
        effort: "none",
      },
      max_output_tokens: 1200,
      store: false,
    },
    { signal },
  );

  if (response.status !== "completed" || response.error || response.incomplete_details) {
    throw new ChatError("답변이 완성되지 않았어요. 질문을 짧게 바꾸거나 다시 보내 주세요.", 502);
  }
  const reply = response.output_text?.trim();
  if (!reply) {
    throw new ChatError("텍스트 답변을 받지 못했어요. 다시 보내 주세요.", 502);
  }
  // 다음 요청의 기록으로 재사용할 수 없는 길이의 답변도 성공으로 처리하지 않습니다.
  if (reply.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError("답변이 너무 길어요. 더 짧게 답해 달라고 요청해 주세요.", 502);
  }
  return reply;
}
