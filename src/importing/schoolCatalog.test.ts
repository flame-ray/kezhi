import { describe, expect, it } from "vitest";
import { resolveSchoolLoginUrl } from "./schoolCatalog";

describe("school login URL", () => {
  it("recognizes a catalogued school from a bare host", () => {
    const school = resolveSchoolLoginUrl("jwgl.ndnu.edu.cn/jwglxt/xtgl/login_slogin.html");
    expect(school?.id).toBe("ndnu");
    expect(school?.loginUrl).toBe("https://jwgl.ndnu.edu.cn/jwglxt/xtgl/login_slogin.html");
  });

  it("creates a safe local profile for another HTTPS school host", () => {
    const school = resolveSchoolLoginUrl("https://jw.example.edu.cn/login");
    expect(school).toMatchObject({ id: "custom-jw-example-edu-cn", domain: "jw.example.edu.cn" });
  });

  it("rejects insecure, credential-bearing, and malformed URLs", () => {
    expect(resolveSchoolLoginUrl("http://jw.example.edu.cn/login")).toBeUndefined();
    expect(resolveSchoolLoginUrl("https://student:secret@jw.example.edu.cn/login")).toBeUndefined();
    expect(resolveSchoolLoginUrl("not-a-school-url")).toBeUndefined();
  });
});
