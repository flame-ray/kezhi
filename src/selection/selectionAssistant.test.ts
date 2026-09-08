import { describe, expect, it } from "vitest";
import { applySeatPayload, learnSelectionInterface, nextMonitorDelaySeconds, normalizeSelectionAssistant, observeSeatAvailability, recordMonitorFailure } from "./selectionAssistant";

describe("selection assistant", () => {
  it("learns same-origin selection candidates from an observed page", () => {
    const adapter = learnSelectionInterface({
      pageUrl: "https://jw.example.edu.cn/jwglxt/xsxk/choose",
      title: "学生选课中心",
      headings: ["2026 秋季学期选课"],
      forms: [{ action: "/jwglxt/xsxk/query", method: "get", fields: ["courseName"] }],
      links: [{ url: "/jwglxt/xsxk/choose", text: "进入选课" }],
      resources: [{ url: "https://jw.example.edu.cn/jwglxt/xsxk/list", initiatorType: "xmlhttprequest" }],
    }, "https://jw.example.edu.cn/login", new Date("2026-09-07T00:00:00.000Z"));

    expect(adapter.systemHint).toBe("正方");
    expect(adapter.monitorEndpoint).toBe("https://jw.example.edu.cn/jwglxt/xsxk/query");
    expect(adapter.candidates.some((item) => item.source === "resource")).toBe(true);
    expect(adapter.confidence).toBeGreaterThan(50);
  });

  it("rejects a learned page that leaves the configured origin", () => {
    expect(() => learnSelectionInterface({
      pageUrl: "https://evil.example/xk",
      title: "选课",
      headings: [],
      forms: [],
      links: [],
      resources: [],
    }, "https://jw.example.edu.cn/login")).toThrow("同一站点");
  });

  it("reads seat availability from common JSON shapes", () => {
    const result = observeSeatAvailability(JSON.stringify({ rows: [{ kch: "MATH101", kcmc: "高等数学", yl: 3, jxbrl: 60 }] }), { courseCode: "MATH101", courseName: "高等数学" });
    expect(result).toMatchObject({ status: "available", availableSeats: 3, capacity: 60 });
  });

  it("backs off after failures and normalizes unsafe persisted settings", () => {
    expect(nextMonitorDelaySeconds(30, 3)).toBe(240);
    expect(normalizeSelectionAssistant({ portalUrl: "http://unsafe.test", intervalSeconds: 1, requireConfirmation: false })).toMatchObject({ portalUrl: "", intervalSeconds: 30, requireConfirmation: true });
  });

  it("applies observations and failures through the module interface", () => {
    const state = normalizeSelectionAssistant({ targets: [{ id: "one", courseCode: "MATH101", courseName: "高数", priority: 1, status: "watching" }] });
    const success = applySeatPayload(state, JSON.stringify([{ courseCode: "MATH101", remaining: 2 }]), new Date("2026-09-07T00:00:00.000Z"));
    expect(success.availableCount).toBe(1);
    expect(success.state.targets[0]).toMatchObject({ status: "available", availableSeats: 2 });
    expect(recordMonitorFailure(success.state, "timeout").consecutiveFailures).toBe(1);
  });
});
