import * as esbuild from "esbuild";
import { unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const outfile = "tmp-ai-coach-parser.mjs";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/integrations.ts"],
  format: "esm",
  logLevel: "silent",
  outfile,
  platform: "browser",
});

try {
  const { parseAiCoachReply, requestAiCoachChat } = await import(
    pathToFileURL(`${process.cwd()}/${outfile}`),
  );
  const weekPlans = [
    {
      date: "2026-05-25",
      title: "恢复骑",
      kind: "recovery",
      durationMinutes: 40,
      powerRange: [85, 100],
    },
  ];
  const reply = {
    message:
      "可以改，但基于上周负荷很高，50公里只作为上限，今晚仍按低Z2执行，不加冲刺和爬坡。",
    planPatch: {
      summary: "将今晚调整为50公里上限的低Z2耐力骑",
      scope: "day",
      changes: [
        {
          date: "2026-05-25",
          after: {
            title: "晚间50公里上限低Z2骑",
            kind: "z2",
            durationMinutes: 100,
            durationLabel: "90-100分钟",
            powerRange: [95, 115],
            segments: [
              {
                name: "热身",
                durationMinutes: 12,
                targetPowerRange: [80, 100],
              },
            ],
          },
          reason: "累积疲劳风险较高。",
        },
      ],
    },
  };
  const json = JSON.stringify(reply);
  const cases = {
    plainJson: json,
    quotedJsonString: JSON.stringify(json),
    escapedBareJsonString: json.replaceAll('"', '\\"'),
    doubleEscapedBareJsonString: json.replaceAll('"', '\\\\"'),
    leadingBackslashBareJsonString: `\\${json.replaceAll('"', '\\"')}\\`,
    chatCompletion: JSON.stringify({ choices: [{ message: { content: json } }] }),
    doubleEncodedChatCompletion: JSON.stringify({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }),
    parsedReplyWithoutPatch: JSON.stringify({
      rawText: json,
      message: json,
    }),
    looseNewline: json.replace("50公里只作为上限", "50公里只作为\n上限"),
  };

  for (const [name, content] of Object.entries(cases)) {
    const parsed = parseAiCoachReply(content, weekPlans);
    if (!parsed.planPatch) {
      throw new Error(`${name} did not produce planPatch`);
    }
    if (parsed.message !== reply.message) {
      throw new Error(`${name} produced wrong message: ${parsed.message}`);
    }
    const title = parsed.planPatch.changes[0]?.after.title;
    if (title !== reply.planPatch.changes[0].after.title) {
      throw new Error(`${name} produced wrong title: ${title}`);
    }
  }

  const payloads = {
    openAiPayload: json,
    openAiDoubleEncodedPayload: JSON.stringify(json),
    openAiEscapedBarePayload: json.replaceAll('"', '\\"'),
    openAiDoubleEscapedBarePayload: json.replaceAll('"', '\\\\"'),
    realChatCompletionContent:
      "{\"message\":\"假设今天是2026-05-25；上周负荷很高且5/23已疲劳，建议今天从95分钟降为45-60分钟恢复骑，状态差就休息。\",\"planPatch\":{\"summary\":\"把今天改为恢复优先\",\"scope\":\"day\",\"changes\":[{\"date\":\"2026-05-25\",\"after\":{\"title\":\"恢复骑或完全休息\",\"kind\":\"recovery\",\"durationMinutes\":45,\"durationLabel\":\"0-45分钟\",\"powerRange\":[80,100],\"segments\":[{\"name\":\"热身\",\"durationMinutes\":10,\"targetPowerRange\":[70,90]},{\"name\":\"轻松转腿\",\"durationMinutes\":25,\"targetPowerRange\":[80,100]},{\"name\":\"冷身\",\"durationMinutes\":10,\"targetPowerRange\":[70,85]}],\"rideDetails\":\"只在睡眠和腿感都还可以时骑；全程RPE 1-2，能轻松聊天，不跟骑、不冲坡。若热身10分钟仍腿沉或心率偏高，直接结束。\",\"notes\":\"今天的目标是恢复，不追公里数和均速；不要超过60分钟。\",\"nutrition\":\"若骑行，出门前可补10-20g碳水；结束后补20-35g蛋白质。晚餐正常吃，保证蛋白质和蔬菜，不用极端控碳。\"},\"reason\":\"近7天TSS 969、5/23单日TSS 497且反馈tired，今天继续95分钟低Z2有累积疲劳风险。\"}]}}}",
    openAiReplyShapePayload: JSON.stringify({
      rawText: json,
      message: json,
    }),
  };

  for (const [name, content] of Object.entries(payloads)) {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }),
    });
    const parsed = await requestAiCoachChat({
      settings: {
        ftp: 175,
        aiEndpoint: "https://example.com/v1",
        aiApiKey: "test-key",
        aiModel: "gpt-test",
      },
      question: "今晚改成50公里左右",
      messages: [],
      weekPlans,
      analyses: [],
      logs: [],
      history: {},
    });
    if (!parsed.planPatch) {
      throw new Error(`${name} request flow did not produce planPatch`);
    }
    if (name !== "realChatCompletionContent" && parsed.message !== reply.message) {
      throw new Error(`${name} request flow produced wrong message: ${parsed.message}`);
    }
    if (name === "realChatCompletionContent" && parsed.planPatch.changes[0]?.after.title !== "恢复骑或完全休息") {
      throw new Error(`${name} request flow produced wrong real payload title`);
    }
  }

  console.log("AI coach parser fixtures passed.");
} finally {
  unlinkSync(outfile);
}
