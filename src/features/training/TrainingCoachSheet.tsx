import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Button, Dialog, Popup, Textarea } from "tdesign-mobile-react";
import type { AiCoachReply } from "../../integrations";
import { parseAiCoachReply, requestAiCoachChat } from "../../integrations";
import type { ActivityAnalysis, AiCoachSession, AiChatMessage, AiPlanPatch, BodyEntry, Checkins, FatigueAnalysisReport, PlanDay, SettingsState, TrainingLog, TrainingTemplate } from "../../model";
import { addDays, dateKey, formatChineseDate } from "../../time";
import { labelKind } from "../../trainingUtils";
import { buildTrainingHistorySummary } from "./trainingHistory";

export function TrainingCoachSheet({
  visible,
  settings,
  plans,
  checkins,
  trainingLogs,
  activityAnalyses,
  bodyEntries,
  templates,
  weekPlans,
  session,
  lastFatigueReport,
  onSession,
  onApplyPatch,
  onClose,
}: {
  visible: boolean;
  settings: SettingsState;
  plans: Record<string, PlanDay>;
  checkins: Record<string, Checkins>;
  trainingLogs: Record<string, TrainingLog>;
  activityAnalyses: Record<string, ActivityAnalysis>;
  bodyEntries: Record<string, BodyEntry>;
  templates: TrainingTemplate[];
  weekPlans: PlanDay[];
  session?: AiCoachSession;
  lastFatigueReport?: FatigueAnalysisReport;
  onSession: (session: AiCoachSession | undefined) => void;
  onApplyPatch: (patch: AiPlanPatch) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteMessageId, setDeleteMessageId] = useState("");
  const [messageActionMenu, setMessageActionMenu] = useState<{
    messageId: string;
    x: number;
    y: number;
  } | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  const messages = session?.messages ?? [];
  const messageViews = useMemo(
    () =>
      messages.map((message) => ({
        message,
        reply:
          message.role === "assistant"
            ? parseAiCoachReply(message.content, weekPlans)
            : undefined,
      })),
    [messages, weekPlans],
  );
  const actionMessage = messageActionMenu
    ? messages.find((message) => message.id === messageActionMenu.messageId)
    : undefined;
  const pendingPatch = session?.pendingPatch?.appliedAt
    ? undefined
    : session?.pendingPatch;
  const recoveredReply = useMemo(() => {
    if (pendingPatch) return undefined;
    for (const view of [...messageViews].reverse()) {
      const { message, reply } = view;
      if (reply?.planPatch) return { messageId: message.id, reply };
    }
    return undefined;
  }, [messageViews, pendingPatch]);
  const activePatch = pendingPatch ?? recoveredReply?.reply.planPatch;
  const quickQuestions = [
    "今天适合练吗？",
    "本周计划要不要降载？",
    "明天做 Z2 还是休息？",
    "帮我调整本周计划",
  ];

  const saveSession = (
    nextMessages: AiChatMessage[],
    pendingPatchNext: AiPlanPatch | undefined | null = pendingPatch,
  ) => {
    onSession({
      messages: nextMessages.slice(-50),
      pendingPatch: pendingPatchNext === null ? undefined : pendingPatchNext,
      updatedAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    if (!visible || pendingPatch || !recoveredReply?.reply.planPatch) return;
    const nextMessages = messages.map((message) =>
      message.id === recoveredReply.messageId
        ? { ...message, content: recoveredReply.reply.message }
        : message,
    );
    saveSession(nextMessages, recoveredReply.reply.planPatch);
  }, [visible, pendingPatch, recoveredReply, messages]);

  useEffect(() => {
    if (!visible) return;
    window.setTimeout(() => {
      const node = messageListRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    }, 40);
  }, [visible, messages.length, loading, activePatch?.id]);

  const sendQuestion = async (value?: string) => {
    const question = (value ?? input).trim();
    if (!question || loading) return;
    setInput("");
    setError("");

    const userMessage = createChatMessage("user", question);
    const nextMessages = [...messages, userMessage];
    saveSession(nextMessages);
    setLoading(true);
    try {
      const recentKeys = Array.from({ length: 42 }, (_, index) =>
        dateKey(addDays(new Date(), -index)),
      );
      const history = buildTrainingHistorySummary({
        settings,
        plans,
        checkins,
        trainingLogs,
        activityAnalyses,
        bodyEntries,
        templates,
      });
      const reply = await requestAiCoachChat({
        settings,
        question,
        messages: nextMessages,
        weekPlans,
        analyses: recentKeys
          .map((key) => activityAnalyses[key])
          .filter(Boolean),
        logs: recentKeys.map((key) => trainingLogs[key]).filter(Boolean),
        history,
        lastFatigueReport,
      });
      const normalizedReply = normalizeCoachReplyForUi(reply, weekPlans);
      saveSession(
        [
          ...nextMessages,
          createChatMessage("assistant", normalizedReply.message),
        ],
        normalizedReply.planPatch ?? pendingPatch,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      saveSession(nextMessages);
    } finally {
      setLoading(false);
    }
  };

  const applyPatch = () => {
    if (!activePatch) return;
    const appliedPatch = {
      ...activePatch,
      appliedAt: new Date().toISOString(),
    };
    onApplyPatch(activePatch);
    const nextMessages = sanitizeRecoveredCoachMessages(messages, weekPlans);
    saveSession(
      [
        ...nextMessages,
        createChatMessage(
          "assistant",
          `已应用计划修改：${activePatch.summary}`,
        ),
      ],
      appliedPatch,
    );
  };

  const dismissPatch = () => {
    saveSession(sanitizeRecoveredCoachMessages(messages, weekPlans), null);
  };

  const deleteMessage = (messageId: string) => {
    saveSession(messages.filter((message) => message.id !== messageId));
  };

  const startMessagePress = (
    messageId: string,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    window.clearTimeout(longPressTimer.current);
    const x = Math.min(Math.max(event.clientX, 82), window.innerWidth - 82);
    const y = Math.max(event.clientY - 12, 84);
    longPressTimer.current = window.setTimeout(() => {
      setMessageActionMenu({ messageId, x, y });
    }, 560);
  };

  const cancelMessagePress = () => {
    window.clearTimeout(longPressTimer.current);
  };

  const copyMessage = async () => {
    if (!actionMessage?.content) return;
    try {
      await navigator.clipboard.writeText(actionMessage.content);
    } catch {
      const input = document.createElement("textarea");
      input.value = actionMessage.content;
      input.setAttribute("readonly", "true");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setMessageActionMenu(null);
  };

  return (
    <Popup
      visible={visible}
      placement="bottom"
      closeOnOverlayClick
      zIndex={1500}
      onClose={onClose}
    >
      <div className="coach-sheet">
        <div className="coach-head">
          <div>
            <h3>训练顾问</h3>
            <p>会结合你的本地训练、身体趋势和最近对话给建议</p>
          </div>
          <Button
            size="small"
            shape="round"
            variant="outline"
            onClick={onClose}
          >
            关闭
          </Button>
        </div>

        <div className="coach-quick">
          {quickQuestions.map((question) => (
            <button
              type="button"
              key={question}
              disabled={loading}
              onClick={() => sendQuestion(question)}
            >
              {question}
            </button>
          ))}
        </div>

        <div className="coach-messages" ref={messageListRef}>
          {messageViews.length ? (
            messageViews.map(({ message, reply }) => (
              <div
                key={message.id}
                className={`coach-message ${message.role}`}
                onPointerDown={(event) => startMessagePress(message.id, event)}
                onPointerUp={cancelMessagePress}
                onPointerCancel={cancelMessagePress}
                onPointerLeave={cancelMessagePress}
                onContextMenu={(event) => event.preventDefault()}
              >
                <p>{formatCoachMessageContent(message, reply)}</p>
              </div>
            ))
          ) : (
            <div className="coach-empty">
              问我今天练不练、本周是否降载，或者让 AI 先给一版计划修改建议。
            </div>
          )}
          {loading && <div className="coach-empty">正在分析训练记录...</div>}
        </div>

        {activePatch && (
          <div className="coach-patch">
            <div className="ai-preview-head">
              <strong>{activePatch.summary}</strong>
              <span>{activePatch.scope === "week" ? "整周" : "单日"}</span>
            </div>
            <div className="coach-patch-list">
              {activePatch.changes.map((change) => (
                <div key={change.date}>
                  <strong>{formatChineseDate(change.date)}</strong>
                  <p>
                    原计划：{change.before.title} ·{" "}
                    {labelKind(change.before.kind)}
                  </p>
                  <p>
                    建议：{change.after.title} · {labelKind(change.after.kind)}
                    {change.after.durationMinutes
                      ? ` · ${change.after.durationMinutes}分钟`
                      : ""}
                  </p>
                  {change.after.powerRange && (
                    <p>
                      功率：{change.after.powerRange[0]}-
                      {change.after.powerRange[1]}W
                    </p>
                  )}
                  {change.reason && <em>{change.reason}</em>}
                </div>
              ))}
            </div>
            <div className="ai-preview-actions">
              <Button
                size="small"
                shape="round"
                variant="outline"
                onClick={dismissPatch}
              >
                忽略
              </Button>
              <Button
                size="small"
                shape="round"
                theme="primary"
                onClick={applyPatch}
              >
                应用修改
              </Button>
            </div>
          </div>
        )}

        {error && <p className="sync-error">{error}</p>}
        <div className="coach-input">
          <Textarea
            value={input}
            placeholder="例如：帮我看下这周怎么调整，或者解释某个训练安排..."
            autosize={{ minRows: 1, maxRows: 4 }}
            onChange={(value) => setInput(String(value))}
          />
          <Button
            theme="primary"
            shape="round"
            loading={loading}
            disabled={!input.trim()}
            onClick={() => sendQuestion()}
          >
            发送
          </Button>
        </div>
      </div>
      {messageActionMenu && actionMessage && (
        <>
          <button
            type="button"
            className="coach-action-backdrop"
            aria-label="关闭消息操作"
            onClick={() => setMessageActionMenu(null)}
          />
          <div
            className="coach-action-bubble"
            style={{
              left: messageActionMenu.x,
              top: messageActionMenu.y,
            }}
          >
            <button type="button" onClick={copyMessage}>
              复制
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setDeleteMessageId(messageActionMenu.messageId);
                setMessageActionMenu(null);
              }}
            >
              删除
            </button>
          </div>
        </>
      )}
      <Dialog
        visible={Boolean(deleteMessageId)}
        title="删除这条消息？"
        content="删除后，这条消息不会再作为下次 AI 咨询的上下文。"
        cancelBtn="取消"
        confirmBtn="删除"
        zIndex={2000}
        onClose={() => setDeleteMessageId("")}
        onCancel={() => setDeleteMessageId("")}
        onConfirm={() => {
          deleteMessage(deleteMessageId);
          setDeleteMessageId("");
          setMessageActionMenu(null);
        }}
      />
    </Popup>
  );
}

export function createChatMessage(
  role: AiChatMessage["role"],
  content: string,
): AiChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeCoachReplyForUi(
  reply: {
    rawText: string;
    message: string;
    planPatch?: AiPlanPatch;
  },
  weekPlans: PlanDay[],
) {
  if (reply.planPatch) return reply;
  const candidates = [
    parseAiCoachReply(JSON.stringify(reply), weekPlans),
    parseAiCoachReply(reply.rawText, weekPlans),
    parseAiCoachReply(reply.message, weekPlans),
  ];
  return candidates.find((candidate) => candidate.planPatch) ?? reply;
}

export function formatCoachMessageContent(
  message: AiChatMessage,
  parsedReply?: AiCoachReply,
) {
  if (message.role !== "assistant") return message.content;
  const reply = parsedReply;
  return reply?.planPatch ? reply.message : message.content;
}

export function sanitizeRecoveredCoachMessages(
  messages: AiChatMessage[],
  weekPlans: PlanDay[],
) {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    const reply = parseAiCoachReply(message.content, weekPlans);
    return reply.planPatch ? { ...message, content: reply.message } : message;
  });
}
