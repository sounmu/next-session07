"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_MESSAGE_LENGTH,
  validateMessages,
  type CharacterDisplay,
  type Message,
} from "@/lib/chat";
import Image from "next/image";

export default function Chat({ character }: { character: CharacterDisplay }) {
  // 성공한 대화만 기록합니다. 첫 인사는 화면에서 별도로 보여 주는 설정 문구입니다.
  // [확장 포인트] 새로고침 후에도 기록을 유지하려면 초기 조회와 성공 시 DB 저장을 연결합니다.
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // ref는 재렌더링 전 연속 클릭도 막고, 초기화 이전 응답을 구분합니다.
  const activeRequest = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, isLoading, error]);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = input.trim();

    if (!content || activeRequest.current) return;

    const nextMessages: Message[] = [...messages, { role: "user", content }];

    const validation = validateMessages(nextMessages);

    if ("error" in validation) {
      setError(validation.error);
      return;
    }

    // 여기서부터 input과 실제 전송할 메시지를 완전히 분리
    setInput("");

    const controller = new AbortController();
    activeRequest.current = controller;

    setPendingMessage(content);
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
        }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "메시지를 보내지 못했어요.");
      }

      if (typeof data?.reply !== "string" || !data.reply.trim()) {
        throw new Error("답변이 비어 있어요. 다시 보내 주세요.");
      }

      if (activeRequest.current !== controller) return;

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.reply,
        },
      ]);
    } catch (cause) {
      if (activeRequest.current !== controller) return;

      // 실패했을 때만 다시 입력창에 복구
      setInput(content);

      setError(
        cause instanceof Error && !(cause instanceof TypeError) && !(cause instanceof SyntaxError)
          ? cause.message
          : "연결에 문제가 생겼어요. 잠시 후 다시 보내 주세요.",
      );
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsLoading(false);
        setPendingMessage("");
      }
    }
  }

  function resetConversation() {
    // 먼저 기존 요청을 무효화하므로 늦게 도착한 응답이 새 대화에 섞이지 않습니다.
    const previous = activeRequest.current;
    activeRequest.current = null;
    previous?.abort();
    setMessages([]);
    setInput("");
    setError("");
    setPendingMessage("");
    setIsLoading(false);
  }

  return (
    <main className="shell">
      <section className="chat-card" aria-label={`${character.name}와 대화`}>
        <header className="chat-header">
          {/* 캐릭터 사진 넣는 자리 */}
          <div className="character-photo-slot" aria-label="캐릭터 사진 자리">
            <Image src="/character.jpeg" alt="시키나미 아스카 랑그레이" width={64} height={64} />
          </div>
          <div className="character-info">
            <div className="character-name-row">
              <h1>{character.name}</h1>
            </div>
            <p>{character.description}</p>
          </div>
          <button
            className="reset"
            type="button"
            onClick={resetConversation}
            aria-label="대화 초기화"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M16.4 9.2a6.5 6.5 0 1 1-2.2-4.8M16.4 3.7v4.5h-4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>새 대화</span>
          </button>
        </header>
        <div className="conversation" role="log" aria-label="대화 목록" aria-live="polite">
          <p className="conversation-start">
            <span /> 아스카다...! <span />
          </p>
          <article className="message assistant">
            <span className="speaker">{character.name}</span>
            <p className="message-bubble">{character.greeting}</p>
          </article>
          {/* [확장 포인트] 스트리밍을 붙이려면 서버를 스트림 응답으로 바꾸고,
              fetch의 reader로 받은 조각을 마지막 캐릭터 말풍선에 누적합니다. */}
          {messages.map((message, index) => (
            <article className={`message ${message.role}`} key={index}>
              <span className="speaker">{message.role === "user" ? "나" : character.name}</span>
              <p className="message-bubble">{message.content}</p>
            </article>
          ))}
          {isLoading && (
            <>
              <article className="message user pending">
                <span className="speaker">나 · 전송 중</span>
                <p className="message-bubble">{pendingMessage}</p>
              </article>
              <p className="waiting" role="status">
                <span className="typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {character.name}가 답변을 생각하고 있어요…
              </p>
            </>
          )}
          <div ref={bottom} />
        </div>
        <form className="composer" onSubmit={handleSubmit}>
          {error && (
            <p className="error" role="alert">
              {error} 입력한 내용은 남아 있어요.
            </p>
          )}
          <label htmlFor="message">메시지</label>
          <div className="input-row">
            <textarea
              id="message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();

                  if (!isLoading && input.trim()) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
              placeholder="메시지를 입력하세요..."
              maxLength={MAX_MESSAGE_LENGTH}
              rows={2}
              disabled={isLoading}
            />
            <button className="send" type="submit" disabled={isLoading || !input.trim()}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12h14m-6-6 6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="sr-only">{isLoading ? "답변 기다리는 중" : "보내기"}</span>
            </button>
          </div>
          <div className="input-help">
            <span>새로고침하면 대화가 초기화됩니다.</span>
            <span>
              {input.length} / {MAX_MESSAGE_LENGTH}
            </span>
          </div>
        </form>
      </section>
      <p className="footer-note">AI 캐릭터의 성격이 실제 세계관과 맞지 않을 수 있어요.</p>
    </main>
  );
}
